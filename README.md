# freedom-social-wechat

#### Build
Just clone the repo, run `npm install` and then `grunt`.

#### Usage
The login flow involves scanning a barcode with the WeChat mobile app - this
authorizes your computer to be logged in (as with the web client).

#### Known Issues
- When you login you may see a "File Transfer" chat in your mobile client - this
is due to how the login process is handled. This chat can be ignored.
- You can use your phone to de-authorize the session, which will of course cause
whatever application on your computer that depended on it to stop working.
