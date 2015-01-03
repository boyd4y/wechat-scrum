var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var routes = require('./routes/index');
var users = require('./routes/users');
var app = express();
var wechat = require('wechat');
var mongoose = require('mongoose-q')(require('mongoose'));

// mongoose.connect('mongodb://localhost/wechat');
mongoose.connect('mongodb://admin:admin@ds029831.mongolab.com:29831/wechat');

var Schema = mongoose.Schema;
var userSchema = new Schema({
  name:  String,
  openId: String,
});

// TTL
var roomSchema = new Schema({
    user_id: Schema.Types.ObjectId,
});

var sessionSchema = new Schema({
    room_id: Schema.Types.ObjectId,
    participant_id: Schema.Types.ObjectId,
    result: Number,
    alias: String,
});

var User = mongoose.model('user', userSchema);
var Room = mongoose.model('room', roomSchema);
var Session = mongoose.model('session', sessionSchema);

// callbacks...
userSchema.post('remove', function(doc){
    Room.find().remove({ user_id: doc._id }).exec();
    Session.find().remove({ participant_id: doc._id }).exec();
});

roomSchema.post('remove', function(doc){
    Session.find().remove({ room_id: doc._id }).exec();
});

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.use(express.query());
app.use(logger('dev'));  // 'dev', 'short', 'tiny'. or no argument (default)

app.get('/', function(req, res){
    res.send('hello world');
});

app.use('/wechat', wechat('aaaaa').text(function (message, req, res, next) {
  parameters = message.Content.split(" ");
  if (parameters[0] == "help") {
    var messages = "";
    messages = messages + "[+] <name>: join room\r\n";
    messages = messages + "[-]: leave room\r\n";
    messages = messages + "[h]: host a room\r\n";
    messages = messages + "[e]: end a room\r\n";
    messages = messages + "[r] <name>: register account\r\n";
    messages = messages + "[p] <number>: make a poker";
    messages = messages + "[.] : list result";
    res.reply(messages);
  } else if (parameters[0] == "-") {
    User.findOneQ({openId: message.FromUserName})
    .then(function (current_user){
        if (current_user == null) { res.reply("user not registered"); }
        else {
            Session.findOneQ({participant_id: current_user._id})
            .then(function (session){
                if (session) {
                    // check room
                    Room.findOneQ({_id: session.room_id})
                    .then(function(room){
                        if ( room.user_id.equals(current_user._id)){
                            room.remove(function(err, room){
                                res.reply("Leave session, you are master, room end.");
                            })
                        } else {
                            session.remove(function(err, session){
                                res.reply("Leave session");
                            })
                        }
                    })
                    .catch(function(err) {res.reply("Error " + err.message)})
                    .done();
                } else { res.reply("Not joined to any session");}
            })

        }
    })
  } else if (parameters[0] == "+") {
    if (parameters[1] == null) { res.reply("Invalid parameter, need a name to join room"); } else {
        User.findOneQ({openId: message.FromUserName})
        .then(function (current_user){
            if (current_user == null) { res.reply("user not registered"); } else {
                User.findOneQ({name: parameters[1]})
                .then(function (host) {
                    if (host == null) {
                        res.reply("Host host not exist");
                    } else if ( host._id.equals(current_user._id)) { res.reply("You are master already"); } else {
                        Room.findOneQ({user_id: host._id})
                        .then(function (room){
                            if (room == null) { res.reply("Room not exist or finished"); } else {
                                Session.findOneQ({participant_id: current_user._id})
                                .then(function (session){
                                    if (session) {
                                        if (session.room_id.equals(room_id)) { 
                                            res.reply("Already joined"); 
                                        } else { res.reply("Joined to other rooms, please leave..."); }
                                    } else {
                                        Session.create({room_id: room_id, participant_id: current_user._id, alias: current_user.name});
                                        res.reply("Joined to room " + host.name);
                                    }
                                })
                            }
                        })
                    }
                })   
            }
        })
    }
  } else if (parameters[0] == "h") {
    User.findOneQ({openId: message.FromUserName})
    .then(function (user) {
        if (user == null) { res.reply("User doesn't exist"); } else {
            Room.findOneQ({user_id: user._id})
            .then(function (room){
                if (room) { res.reply("Room already exist"); } else {
                    Room.createQ({user_id: user._id})
                    .then(function(room){
                        Session.createQ({room_id: room._id, participant_id: user._id, alias: user.name})
                        .then(function(session){res.reply("Room created");})
                        .catch(function(err) {res.reply("Session create failed" + err.message)})
                    })
                    .catch(function(err){ res.reply("System Error" + err.message) })
                }
            })
        }
    })
  } else if (parameters[0] == "e") {
    User.findOneQ({openId: message.FromUserName})
    .then(function (user) {
        if (user == null) { res.reply("User doesn't exist"); } else {
            Room.findOneQ({user_id: user._id})
            .then(function (room){
                if (!room) { res.reply("Room doesn't exist"); } else {
                    room.remove();
                    res.reply("Room finished");
                }
            })
        }
    })
  } else if (parameters[0] == "p") {
    if (parameters[1] == null) { res.reply("Invalid parameter, need a porker number"); } else {
        User.findOneQ({openId: message.FromUserName})
        .then(function (current_user){
            if (current_user == null) { res.reply("user not registered"); } else {
                Session.findOneQ({participant_id: current_user._id})
                .then(function(session){
                    if (!session) { res.reply("Haven't join any room"); } else {
                        number = parseInt(parameters[1]);
                        session.result = number;
                        session.saveQ()
                        .then(function(results){res.reply("Played!")})
                        .catch(function(err){res.reply("System Error " + err.message)})
                        .done();
                    }
                })
            }
        })
    }
  } else if (parameters[0] == ".") {
    // list results...
    User.findOneQ({openId: message.FromUserName})
    .then(function (current_user){
        if (current_user == null) { res.reply("user not registered"); } else {
            Session.findOneQ({participant_id: current_user._id})
            .then(function(session){
                if (!session) { res.reply("Haven't join any room"); } else {
                    Session.findQ({room_id: session.room_id})
                    .then(function(results){
                        var messages = "";
                        results.forEach(function(session){
                            messages = messages + session.alias + " play " + session.result + "\r\n";
                        });
                        res.reply(messages);
                    })
                }
            })
        }
    })
  } else if (parameters[0] == "r") {
    if (parameters[1] == null) { res.reply("Invalid parameters, see help"); } else {
        User.findOneQ({$or: [{openId: message.FromUserName}, {name: parameters[1]}]})
        .then(function (user) {
            if (user) { res.reply("User already exist"); } else {
                User.create({"name": parameters[1], "openId": message.FromUserName});
                res.reply("User created");
            }
        })
    }
  }
}).image(function (message, req, res, next) {
  // TODO
  res.reply({type: "text", content: "Not understand"});
}).voice(function (message, req, res, next) {
  // TODO
  res.reply({type: "text", content: "Not understand"});
}).video(function (message, req, res, next) {
  // TODO
  res.reply({type: "text", content: "Not understand"});
}).location(function (message, req, res, next) {
  // TODO
  res.reply({type: "text", content: "Not understand"});
}).link(function (message, req, res, next) {
  // TODO
}).event(function (message, req, res, next) {
  res.reply({type: "text", content: "Not understand"});
  // TODO
}).middlewarify());

module.exports = app;

var server = app.listen(9393, function() {
    console.log('Listening on port %d', server.address().port);
});

