#! /bin/bash
source "${HOME}"/.bashrc

cd /home/reddity/camp360 || exit 1
export GOOGLE_APPLICATION_CREDENTIALS="/home/reddity/camp360-credentials.json"
npm start