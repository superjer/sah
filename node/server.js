var http = require('http').Server(/* handler */);
var io = require('socket.io')(http);
var fs = require('fs');
var port = 1337;
var cardfile = '../cards.tab';
var cachefile = 'cache/save.json';

var init = 0;
var games = {};
var games_p = {}; // private stuff -- don't send to clients
var cards = {};
var wlist = [];
var blist = [];
var players = {};
var sockets = {};
var maxgameid = 0;
var changes = false;
var heartto = null;

var autosave = function() {
    if( changes && init == 2 )
    {
        changes = false;

        var saveme = {
            games: games,
            games_p: games_p,
            players: players,
            maxgameid: maxgameid
        };

        fs.writeFile(cachefile, JSON.stringify(saveme), {mode:0660}, function(err){
            if( err ) console.log(err);
            else console.log('Saved');
        });
    }

    setTimeout(autosave, 5000);
};

setTimeout(autosave, 5000);

fs.readFile(cardfile, {encoding: 'utf8'}, function(err, data){
    init++;

    if( err ) throw err;
    data = data.trim().split("\n");

    for( var i in data ) {
        var cardid = +i+1;
        var line = data[i].split("\t");
        var err = '';
        var color = line[1];
        var num = +line[2];
        var txt = line[3];

        if( line.length != 4 )                         err += 'Bad col count';
        if( !color.match(/^black|white|green$/) )      err += 'Bad color ';
        if( color == 'black' && (num < 1 || num > 3) ) err += 'Bad num ';
        if( !txt || txt.length < 1 )                   err += 'Bad txt ';

        if( err ) {
            console.log(cardfile + ': ' + err + 'on line ' + cardid);
            continue;
        }

        if( color == 'green' )
            continue;

        cards[cardid] = {cardid: cardid, color: color, num: num, txt: txt};

        if( color == 'white' )
            wlist.push(cardid);
        else
            blist.push(cardid);
    }
});

fs.readFile(cachefile, {encoding: 'utf8'}, function(err, data){
    init++;

    if( err )
    {
        console.log("Could not load cache file: " + cachefile);
        return;
    }

    data = JSON.parse(data);
    games = data.games;
    games_p = data.games_p;
    players = data.players;
    maxgameid = data.maxgameid;

    console.log("Loaded " + Object.keys(games).length + " games:");
    console.log("Loaded " + Object.keys(players).length + " players");
    console.log("Max game id: " + maxgameid);
});

http.listen(port, function(){
    console.log('Listening on ' + port);
});

io.on('connection', function(socket) {
    var playerid = 0;
    var playername = "";
    var playerlong = "()";
    var player = {};
    var hand = [];
    var game = {};
    var game_p = {};
    var cookies = socket.handshake.headers.cookie.split(';');

    if( init != 2 )
        console.log('Connection before init!');

    for( var x in cookies ) {
        var cookie = cookies[x].trim().split('=');
        if( cookie[0] == 'sj_id' || cookie[0] == 'sj_t_id' )
            playerid = +cookie[1];
        else if( cookie[0] == 'sj_name' || cookie[0] == 'sj_t_name' )
            playername = "" + cookie[1];
    }

    if( !playerid ) {
        console.log('Client is not logged in: ' + socket.id);
        socket.emit('state', {msg:'Please <a href=../!login.php?return=sah>login</a> to play!'});
        socket.disconnect();
        return;
    }

    if( !playername )
        playername = 'Player ' + playerid;

    playerlong = playername + ' (' + playerid + ')';

    sockets[playerid] = socket;

    if( playerid in players ) {
        player = players[playerid];
        game = games[player.gameid] || {};
        game_p = games_p[player.gameid] || {};
        hand = game_p.hands ? game_p.hands[playerid] : [];
        console.log(playerlong + ' re-connected');
    } else {
        var hrtime = process.hrtime();
        player = {
            playerid: playerid,
            name: playername,
            gameid: 0,
        };
        reset_player(player);
        players[playerid] = player;
        console.log(playerlong + ' connected');
    }

    tell_player(player);

    socket.on('check', function(data) {
        if( data.movement )
            bump_player(player);

        if( process.hrtime[0] - player.time > 60 )
            player.idle++;
    });

    socket.on('create', function(data) {
        if( player.gameid ) {
            console.log(playerlong + ' cannot create game');
            socket.emit('state', {msg:'Already in a game'});
            return;
        }

        create_game(data);
        join_game();
        new_round(game);
        tell_player(player);
        tell_lobby();
        console.log(playerlong + ' created game "' + game.name + '" (' + game.gameid + ')');
        changes = true;
    });

    socket.on('join', function(data) {
        if( !data.gameid || !games[data.gameid] ) {
            console.log(playerlong + ' tried to join non-existent game');
        } else if( player.gameid ) {
            console.log(playerlong + ' tried to join multiple games');
        } else {
            game = games[data.gameid];

            if( game.pass && data.pass != games_p[data.gameid].pass ) {
                console.log(playerlong + ' not allowed in game "' + game.name + '" (' + game.gameid + ')');
                socket.emit('state', {msg:'Wrong password'});
                game = {};
            } else {
                game_p = games_p[game.gameid];
                join_game();
                console.log(playerlong + ' joined game "' + game.name + '" (' + game.gameid + ')');
                changes = true;
            }
        }

        tell_game(game);
    });

    socket.on('draw', function(data) {
        var handcount = 0;
        var free = 0;
        for( var h = 0; h < 13; h++ ) {
            if( hand[h] && hand[h].cardid )
                handcount++;
            else if( h > 2 && !free )
                free = h;
        }

        if( handcount < 10 ) {
            var cardid = game_p.wlist.pop();
            hand[free] = cards[cardid];
        }

        bump_player(player);
        tell_player(player);
        changes = true;
    });

    socket.on('move', function(data) {
        var slot = +data.slot;
        if( slot < 0 || slot > 12 ) {
            console.log(playerlong + ' tried to move to invalid slot ' + data.slot);
            return;
        }

        for( var h = 0; h < 13; h++ ) {
            if( h == slot )
                continue;
            if( hand[h] && hand[h].cardid == data.cardid ) {
                var tmp = hand[h];
                hand[h] = hand[slot];
                hand[slot] = tmp;
                break;
            }
        }

        whatup_player(player);
        bump_player(player);
        tell_game(game);
        changes = true;
    });

    socket.on('leave', function(data) {
        if( player.gameid ) {
            player.gameid = 0;
            game.playerids.splice(game.playerids.indexOf(playerid), 1);

            tell_game(game);
            console.log(playerlong + ' left game "' + game.name + '" (' + game.gameid + ')');

            game = {};
            game_p = {};
        }

        tell_player(player);
        changes = true;
    });

    socket.on('disconnect', function() {
        player.gone = 1;
        console.log(playerlong + ' disconnected');
    });

    var create_game = function(data) {
        var gameid = ++maxgameid;
        game = games[gameid] = {
            gameid     : gameid,
            name       : "" + data.game.name,
            pass       : data.game.pass ? 1 : 0,
            goal       : +data.game.goal || 11,
            maxrounds  : +data.game.maxrounds || 55,
            roundsecs  : +data.game.roundsecs || 180,
            abandonsecs: +data.game.abandonsecs || 180,
            slowstart  : data.game.slowstart ? 1 : 0,
            state      : 'gather',
            time       : process.hrtime()[0],
            secs       : 0,
            round      : 0,
            high       : 0,
            czar       : 0,
            playerids  : []
        };

        game_p = games_p[gameid] = {
            pass: "" + data.game.pass,
            wlist: shuffle(wlist.slice()),
            blist: shuffle(blist.slice()),
            hands: {}
        };
    };

    // join a game, assuming game and game_p are already set correctly
    var join_game = function() {
        player.gameid = game.gameid;
        player.czartime = game.time - 10;

        if( game.playerids.indexOf(playerid) == -1 )
            game.playerids.push(player.playerid);

        if( !game_p.hands[playerid] )
            game_p.hands[playerid] = [];

        hand = game_p.hands[playerid];
        bump_player(player);
    };
});

var heartbeat = function(){
    clearTimeout(heartto);
    var hrtime = process.hrtime();

    for( var gameid in games ) {
        var game = games[gameid];
        game.secs = hrtime[0] - game.time;
    }

    for( playerid in players )
        tell_player(players[playerid]);

    heartto = setTimeout( heartbeat, 9000 );
};

heartto = setTimeout( heartbeat, 2000 );

var reset_player = function(player) {
    player.score = 0;
    player.idle = 0;
    player.gone = 0;
    player.abandon = 0;
    player.whatup = 0;
    player.time = process.hrtime()[0];
    player.czartime = process.hrtime()[0];
};

var whatup_player = function(player) {
    player.whatup = 0;
    if( !player.gameid ) return;
    var game_p = games_p[player.gameid];
    if( !game_p ) return;
    var hand = game_p.hands[player.playerid];
    if( !hand ) return;
    for( var h = 0; h < 3; h++ ) {
        if( hand[h] && hand[h].cardid )
            player.whatup++;
    }
};

var bump_player = function(player) {
    player.time = process.hrtime[0];
    player.idle = 0;
    player.gone = 0;
};

var tell_lobby = function() {
    for( playerid in players )
        if( !players[playerid].gameid )
            tell_player(players[playerid]);
};

var tell_game = function(game) {
    for( pidx in game.playerids ) {
        var p = game.playerids[pidx];
        tell_player(players[p]);
    }
};

var tell_player = function(player) {
    var hrtime = process.hrtime();
    var socket = sockets[player.playerid];

    if( !socket || !socket.connected ) return;

    var game = player.gameid ? games[player.gameid] : null;
    var hand = player.gameid ? games_p[player.gameid].hands[player.playerid] : null;
    var lobby = player.gameid ? null : games;
    var playersout = [];

    if( game ) for( pidx in game.playerids ) {
        var p = game.playerids[pidx];
        playersout.push(players[p]);
    }

    socket.emit('state', {
        lobby: lobby,
        game: game,
        players: playersout,
        selfid: player.playerid,
        hand: hand,
        now: hrtime[0],
        nano: hrtime[1]
    });
};

var new_round = function(game) {
    var game_p = games_p[game.gameid];
    var blackid = game_p.blist.pop()
    game.black = cards[blackid];
    var next = null;

    for( pidx in game.playerids ) {
        var playerid = game.playerids[pidx];
        var player = players[playerid];

        if( !next || next.czartime > player.czartime )
            next = player;
    }

    game.czar = next.playerid;
    game.time = process.hrtime()[0];
    next.czartime = process.hrtime()[0];
};

var shuffle = function(arr) {
    var len = arr.length;
    while( len ) {
        var i = Math.floor(Math.random() * len);
        len--;
        var tmp = arr[len];
        arr[len] = arr[i];
        arr[i] = tmp;
    }
    return arr;
};

// vim: sw=4 ts=4 et
