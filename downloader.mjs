import debug from 'debug';
import fs from 'fs';
import fetch from 'node-fetch';
import { Low, JSONFile } from 'lowdb';
import path from 'path';

let db = {};

const readConfig = async () => {
    db = new Low(new JSONFile('config.json'));
    await db.read();
    db.data = db.data || {
        refresh_token: '',
        code_verifier: '',
        download_directory: ''
    };
};

const authorize = async () => {
    var refreshToken = db.data.refresh_token;
    var codeVerifier = db.data.code_verifier;
    
    const logiUrl = new URL('https://accounts.logi.com/identity/oauth2/token');
    var searchParams = new URLSearchParams();
    searchParams.append('grant_type', 'refresh_token');
    searchParams.append('client_id', '0499da51-621f-443f-84dc-5064f631f0d0');
    searchParams.append('refresh_token', refreshToken);
    searchParams.append('redirect_uri', 'https://circle.logi.com/');
    searchParams.append('scope', 'circle:all');
    searchParams.append('code_verifier', codeVerifier);

    let authResponse = await fetch(logiUrl.toString(), {
        method: 'POST',
        headers: {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Origin': 'https://circle.logi.com'
        },
        body: searchParams.toString()
    });
    
    
    var text = await authResponse.text();
    var json = JSON.parse(text);
    
     
    db.data.refresh_token = json.refresh_token;
    await db.write();
    
    return json.access_token;
};

const get_accessories = async (sessionCookie) => {
    var response = await fetch('https://video.logi.com/api/accessories', {
        headers: {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json; charset=utf-8',
            'Authorization': 'LIDS '+sessionCookie,
            'Origin': 'https://circle.logi.com'
        }
    });
    var text = await response.text();
    
    return JSON.parse(text);
};

const get_activities = async (accessory, sessionCookie) => {
    let activitiesList = [];
    let activitiesResponse = { nextStartTime: null };

    do {
        activitiesResponse = await fetch(`https://video.logi.com/api/accessories/${accessory.accessoryId}/activities`, 
        {
            method: 'POST',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json',
                'Authorization': 'LIDS ' + sessionCookie,
                'Origin': 'https://circle.logi.com'
            },
            body: JSON.stringify({
                "extraFields": [
                    "activitySet"
                ],
                "operator": "<=",
                "limit": 80,
                "scanDirectionNewer": true,
                "startActivityId": activitiesResponse.nextStartTime,
            })
        }).then(response => response.json());

        activitiesList.push(...activitiesResponse.activities);
    }
    while(activitiesResponse.nextStartTime)

    return activitiesList;
};

const download_activity = async(accessory, activity, sessionCookie) => {
    let url = `https://video.logi.com/api/accessories/${accessory.accessoryId}/activities/${activity.activityId}/mp4`;
    debug(`downloading ${url}`);

    return await fetch(url, {
        headers: {
            'Authorization': 'LIDS '+sessionCookie,
            'Origin': 'https://circle.logi.com'
        }
    }).then(response => {
        let contentDisposition = response.headers.get('content-disposition');
        let filename = contentDisposition.match(/filename=([^;]+)/)[1];
        return [filename, response.body];
    });
};

const save_stream = async(filepath, stream) => {
    stream.pipe(fs.createWriteStream(filepath)).on('close', () => {
        debug('saved', filepath);
    });
};

const run = async() => {

    const downloadDb = new Low(new JSONFile('db.json'));
    await downloadDb.read();

    downloadDb.data = downloadDb.data || { downloadedActivities: [] };

    await readConfig();
    let sessionCookie = await authorize();

    let accessories = await get_accessories(sessionCookie);

    for(var i = 0; i < accessories.length; i++) {
        let accessory = accessories[i];        
        let activities = await get_activities(accessory, sessionCookie);
    
        for(var j = 0; j < activities.length; j++) {
            let activity = activities[j];

            let found = downloadDb.data.downloadedActivities.indexOf(activity.activityId) > -1;

            if(!found) {

                let [filename, stream] = await download_activity(accessory, activity, sessionCookie);

                let dir = db.data.download_directory;
                                
                let pathWithDevice = path.join(dir, accessory.name);

                if (!fs.existsSync(pathWithDevice)) {
                    fs.mkdirSync(path.join(pathWithDevice));
                }

                dir = pathWithDevice;                

                let filepath = path.join(dir, filename);
                
                await save_stream(filepath, stream);
                downloadDb.data.downloadedActivities.push(activity.activityId);
                await downloadDb.write();
            }
        }
    }
};

run()
