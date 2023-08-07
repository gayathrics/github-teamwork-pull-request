const core = require('@actions/core');
const github = require('@actions/github');
const { context } = require('@actions/github');
const btoa = require('btoa');
const fetch = require('node-fetch');
const GITHUB_TOKEN = core.getInput('GITHUB_TOKEN');
const twUri = core.getInput('TEAMWORK_URI');
const twApiKey = core.getInput('TEAMWORK_API_KEY');
const twProjectId = core.getInput('TEAMWORK_PROJECT_ID');
const twOpenedColName = core.getInput('TEAMWORK_OPENED_COLUMN');
const twClosedColName = core.getInput('TEAMWORK_CLOSED_COLUMN');
const twMergedColName = core.getInput('TEAMWORK_MERGED_COLUMN');

const { pull_request, action } = context.payload;
const event = context.eventName;
const merged = pull_request.merged;
const user = pull_request.user.login;
const user_url = pull_request.user.html_url;
const pr_url = pull_request._links.html.href;
const pr_title = pull_request.title;
const base_ref = pull_request.base.ref;
const head_ref = pull_request.head.ref;

let auth = btoa(`${twApiKey}:x`);
var myHeaders = new fetch.Headers();
myHeaders.append("Content-Type", "application/json");
myHeaders.append("Authorization", `Basic ${auth}`);

function getTaskId(body) {
    const parts = body.split('/');
    return parts.at(-1);
}

async function getBoardColumns() {

    var requestOptions = {
        method: 'GET',
        headers: myHeaders,
        redirect: 'follow'
      };
      
    const url = `${twUri}/projects/${twProjectId}/boards/columns.json`;
    const  data  = await fetch(url, requestOptions)      
      
    const result = await data.json();
        
    return result;
}

function lookupCols(data) {
    let colIds = {};
    var cols = data.columns;
    for (const key in cols) {
        //console.log(cols[key].name);
        if (cols[key].name == twOpenedColName) {
            colIds["opened"] = cols[key].id
        }
        else if (cols[key].name == twClosedColName) {
            colIds["closed"] = cols[key].id
        }
        else if (cols[key].name == twMergedColName) {
            colIds["merged"] = cols[key].id
        }
    }
    //console.log(`the columns are: ${colIds}`);
    return colIds;
}


let taskId = getTaskId(pull_request.body);
//console.log(taskId);
// const cols = {};
// cols["closed"] = '116031';
// cols['opened'] = '116032';
// cols['merged'] = '116033';
let cols = {}

function updateTask(col, tag, progress) {
    //console.log(col, tag, progress);
    var raw = JSON.stringify({
        "card": {
            "columnId": parseInt(col)
        },
        "tags": [
            {
                "name": tag,
                "projectId": parseInt(twProjectId)
            }
        ],
        "tasK": {
            "progress": progress
        }
    });

    var requestOptions = {
        method: 'PATCH',
        headers: myHeaders,
        body: raw,
        redirect: 'follow'
    };

    fetch(`${twUri}/projects/api/v3/tasks/${taskId}.json`, requestOptions)
        .then(response => response.text())
        .then(result => console.log(result))
        .catch(error => console.log(`error updating task: ${error}`));
}

function createComment(comment) {
    var raw = JSON.stringify({
        "comment": {
            "body": comment,
            "notify": "",
            "isprivate": false,
            "pendingFileAttachments": "",
            "content-type": "TEXT"
        }
    });

    var requestOptions = {
        method: 'POST',
        headers: myHeaders,
        body: raw,
        redirect: 'follow'
    };

    fetch(`${twUri}/tasks/${taskId}/comments.json`, requestOptions)
        .then(response => response.text())
        .then(result => console.log(result))
        .catch(error => console.log(`error adding a comment to the task: ${error}`));
}

function removeTags(removeCols) {
    var raw = JSON.stringify({
        "tags": {
          "content": removeCols
        },
        "removeProvidedTags": true
      });
      
      var requestOptions = {
        method: 'PUT',
        headers: myHeaders,
        body: raw,
        redirect: 'follow'
      };
      
      fetch(`${twUri}/tasks/${taskId}/tags.json"`, requestOptions)
        .then(response => response.text())
        .then(result => console.log(result))
        .catch(error => console.log('error', error));
}

function prOpened(col) {
    updateTask(col, 'PR Opened', 20);
    var comment = `**[${user}](${user_url})** opened a PR: **${pr_title}**
    [${pr_url}](${pr_url})
    ${base_ref} <- ${head_ref}`;
    createComment(comment);
}

function prClosed(col) {
    retVal = updateTask(col, 'PR Closed', 10);
    var comment = `**[${user}](${user_url})** closed the PR: **${pr_title}**
    [${pr_url}](${pr_url})
    ${base_ref} <- ${head_ref}`;
    retVal = retVal + createComment(comment)

    return retVal;
}

function prMerged(col) {
    retVal = updateTask(col, 'PR Merged', 40);
    var comment = `**[${user}](${user_url})** merged the PR: **${pr_title}**
    [${pr_url}](${pr_url})
    ${base_ref} <- ${head_ref}`;
    retVal = retVal + createComment(comment);

    return retVal;
}

async function sync() {

    const colsData = await getBoardColumns();
    const cols = lookupCols(colsData);
    //console.log(`the cols are: ${cols}`);
    var message = "";      
    //console.log(`Event: ${event}`);
    //console.log(`Action: ${action}`);
    
    if (event == 'pull_request' && action == 'opened') {
        message = prOpened(cols['opened']);
        removeTags(cols['merged'], cols['closed']);
    }
    else if (event == 'pull_request' && action == 'closed') {
        if (merged) {
            message = prMerged(cols['merged']);
            removeTags(cols['opened'], cols['closed']);
        }
        else {
            message = prClosed(cols['closed']);
            removeTags(cols['merged'], cols['opened']);
        }
    }
    else {
        message = "no action taken";
    }


    //var log = event + ": " + JSON.stringify(context);

    core.setOutput("taskid", taskId);

}

// var temp = JSON.stringify(pull_request);
// console.log(`pull_request: ${temp}`);
sync()
