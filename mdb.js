var Grid = require('gridfs-stream');
var mongoose = require('mongoose');
var fstream = require('fstream');
var fs = require("fs");
var winston = require("winston");
var _ = require("underscore");

exports = module.exports;

var ObjectId = mongoose.Schema.ObjectId;
var Mixed = mongoose.Schema.Types.Mixed;

mongoose.connect('mongodb://' + process.env.XIMERA_MONGO_URL + "/" +
                 process.env.XIMERA_MONGO_DATABASE);
var gfs = Grid(mongoose.connection.db, mongoose.mongo);

// Notice this is different from Schema.ObjectId; Schema.ObjectId if for passing
// models/schemas, Types.ObjectId is for generating ObjectIds.
exports.ObjectId = mongoose.Types.ObjectId;
exports.gfs = gfs;

// TODO: Add appropriate indexes.
exports.initialize = function initialize() {
    winston.info("Initializing Mongo");
    exports.GitRepo = mongoose.model("GitRepo",
                                     {
                                         // Key
                                         gitIdentifier: String,
                                         // Other
                                         file: ObjectId,
                                         currentActivities: [ObjectId]
                                     });

    exports.Activity = mongoose.model("Activity",
                                      {
                                          // Key
                                          repo: {type: ObjectId, ref:"GitRepo"},
                                          relativePath: String,
                                          baseFileHash: {type: String, index: true},
                                          // Other
                                          htmlFile: ObjectId,
                                          latexSource: String,
                                          description: String,
                                          title: String,
                                          recent: Boolean,
                                          slug: String
                                      });

    exports.User = mongoose.model("User",
                                  {
                                      openId: String,
                                      name: String,
                                      email: String,
                                      isGuest: Boolean
                                  });

    exports.Scope = mongoose.model("Scope",
                                   new mongoose.Schema({
                                       activity: ObjectId,
                                       user: ObjectId,
                                       dataByUuid: Mixed
                                   }, {
                                       minimize: false
                                   }));

    var CourseSchema = new mongoose.Schema ({
        // Key
        repo: ObjectId,
        relativePath: String,
        // Other
        name: String,
        description: String,
	slug: {type: String, index: true},
        activityTree: Mixed
    });

    RegExp.escape= function(s) {
	return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    };

    CourseSchema.methods.normalizeSlug = function normalizeActivitySlug(activitySlug) {
	var repo = this.slug.split('/').slice(0,2).join( '/' )
	var re = new RegExp("^" + RegExp.escape(repo) + '\\/');
	return activitySlug.replace( ":", '/' ).replace( re, '' );
    };

    CourseSchema.methods.flattenedActivities = function flattenedActivities() {
	var queue = [];

	var f = function(nodes) {
	    for(var i = 0; i < nodes.length; i++) {
		queue.push( nodes[i] );
		f(nodes[i].children);
	    }
	};
	
	f(this.activityTree);

	return queue;
    };

    CourseSchema.methods.previousActivity = function previousActivities(activity) {
	var flattened = this.flattenedActivities();

	activity = _.find( flattened, function(x) { return x.slug === activity.slug } );
	if (activity === undefined)
	    return null;

	var i = _.indexOf( flattened, activity );

	if (i <= 0)
	    return null;

	return flattened[i-1];
    };

    CourseSchema.methods.nextActivity = function nextActivities(activity) {
	var flattened = this.flattenedActivities();

	activity = _.find( flattened, function(x) { return x.slug === activity.slug } );
	if (activity === undefined)
	    return null;

	var i = _.indexOf( flattened, activity );

	if (i + 1 < flattened.length)
	    return flattened[i+1];

	return null;
    };

    CourseSchema.methods.activityParent = function activityParent(activity) {
	var f = function(nodes) {
	    for(var i = 0; i < nodes.length; i++) {
		var result = f(nodes[i]);
		if (result) return result;

		if (_.where( nodes[i].children, {slug: activity.slug} ).length > 0) {
		    return nodes[i];
		}
	    }

	    return null;
	};

	return f(this.activityTree);
    };

    CourseSchema.methods.activitySiblings = function activitySiblings(activity) {
	var parent = this.activityParent(activity);

	if (parent)
	    return parent.children;

	return this.activityTree;
    };

    exports.Course = mongoose.model('Course', CourseSchema );

    exports.GitRepo.find({}, function (err, repos) {
	if (repos.length == 0) {
	    var testRepo = new exports.GitRepo({
		gitIdentifier: "kisonecat/git-pull-test",
		file: mongoose.Types.ObjectId()
	    });
	    testRepo.save(function () {});
	}
    });
}

exports.copyLocalFileToGfs = function (path, fileId, callback) {
	var locals = {pipeErr: false};
	read = fs.createReadStream(path);
    write = gfs.createWriteStream({
        _id: fileId,
        mode: 'w'
    });
    write.on('error', function (err) {
        locals.pipeErr = true;
    });
    write.on('close', function (file) {
        if (locals.pipeErr) {
            callback("Unknown error saving archive.");
        }
        else {
            winston.info("GFS file written.")
            callback();
        }
    });
    read.pipe(write);
}
