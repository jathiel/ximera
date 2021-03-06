#!/bin/bash
if [ $(hostname) = ext ]; then
    echo copy files...
    rsync -avz -f"- .git/" . ximera:/var/www/apps/ximera
    echo ssh to the deploy machine...
    ssh ximera "cd /var/www/apps/ximera ; source deploy.sh"
else
    echo made it to the deploy machine!
    echo stop old copies of app.js...
    ./node_modules/forever/bin/forever stop app.js
    echo start a new copy of app.js...
    source environment.sh
    export DEPLOYMENT=production
    ./node_modules/forever/bin/forever start -a -l forever.log -o out.log -e err.log app.js &
fi
