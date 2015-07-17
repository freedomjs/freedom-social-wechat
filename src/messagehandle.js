// For only handling plaintext messages here ( && currMsg.MsgType === 1)
var from = currMsg.FromUserName;
var sender = "<unknown>";
for (var j = 0; j < this.contacts.length; j++) {
	if (from === this.contacts[j].UserName) {
		sender = this.contacts[j].NickName;
		j = this.contacts.length;
	}
}
var ts = this.formTimeStamp(currMsg.CreateTime * 1000);
if (!this.slctdUser || from !== this.slctdUser) {
	this.log(3, ts + "Recieved message from \"" + sender + "\"", -1);
} else {
	this.log(5, ts + currMsg.Content, -1); 
}
this.webwxStatusNotify(loginData, 1, from);  // TODO
