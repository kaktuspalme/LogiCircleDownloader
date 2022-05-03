# LogiCircleDownloader

Usage: Tired of using circle.logi.com to see your clips? Want to keep a local archive, automatically? Call this script to download the individual clips from the command line.

Installation:

1. Create a "videos" subdirectory to hold the downloaded videos
2. `npm install`
3. Grab code_verifier and refresh_token from the browser session from the POST request to https://accounts.logi.com/identity/oauth2/token You find the code_verifier in the request and the refresh_token in the response.
4. node downloader.mjs
