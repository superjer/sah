var http = require('http').Server(/* handler */);
var io = require('socket.io')(http);
var fs = require('fs');
var port = 1337;
var cardfile = 'cards.tab';
var cachefile = 'cache/save.json';
var version = 3;

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
        });
    }

    setTimeout(autosave, 10000);
};

setTimeout(autosave, 10000);

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

    if( init != 2 ) {
        console.log('Connection before init!');
        socket.emit('state', {msg:'Server not ready'});
        socket.disconnect();
        return;
    }

    // get logged-in state from cookies
    var cookies = parse_cookies(socket.handshake.headers.cookie);
    playerid = +cookies['sj_id'] || +cookies['sj_t_id'];
    playername = cookies['sj_name'] || cookies['sj_t_name'];

    if( !playerid ) {
        console.log('Client is not logged in: ' + socket.id);
        socket.emit('state', {msg:'Please <a href=../!login.php?return=sah>login</a> to play'});
        socket.disconnect();
        return;
    }

    // FIXME remove -- this is just for old cookies
    if( !playername )
        playername = 'Player ' + playerid;

    playerlong = playername + ' (' + playerid + ')';

    // FIXME -- register multiple sockets per player?
    sockets[playerid] = socket;

    // existing player, or new one?
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
            czartime: 0
        };
        reset_player(player);
        players[playerid] = player;
        console.log(playerlong + ' connected');
    }

    player.gone = 0;
    tell_player(player);

    // player's browser is just checking in from time to time
    socket.on('check', function(data) {
        if( data.movement )
            bump_player(player);
    });

    // player is creating a new game (room in the UI)
    socket.on('create', function(data) {
        if( player.gameid ) {
            console.log(playerlong + ' cannot create game');
            socket.emit('state', {msg:'Already in a game'});
            return;
        }

        create_game(data);
        join_game();
        player.czartime -= 100;
        new_round(game);
        bump_player(player);
        tell_player(player);
        tell_lobby();
        console.log(playerlong + ' created game "' + game.name + '" (' + game.gameid + ')');
        changes = true;
    });

    // player is trying to join a game
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
                bump_player(player);
                console.log(playerlong + ' joined game "' + game.name + '" (' + game.gameid + ')');
                changes = true;
            }
        }

        tell_game(game);
    });

    // player wants to draw a new card
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

    // player moved a card to a new position
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

        var mintime = process.hrtime()[0] - game.roundsecs + 5;
        if( game.time < mintime )
            game.time = mintime;
        whatup_player(player);
        bump_player(player);
        tell_game(game);
        changes = true;
    });

    // player clicked Call It button
    socket.on('callit', function(data) {
        if( playerid != game.czar ) {
            console.log(playerlong + ' is not the Czar and is trying to call');
            return;
        }

        if( game.state != 'gather' ) {
            console.log(playerlong + ' is trying to call during ' + game.state);
            return;
        }

        callit(game, true);
    });

    // player clicked to reveal card/s
    socket.on('reveal', function(data) {
        if( playerid != game.czar ) {
            console.log(playerlong + ' is not the Czar and is trying to reveal');
            return;
        }

        if( game.state != 'select' ) {
            console.log(playerlong + ' is trying to reveal during ' + game.state);
            return;
        }

        if( data.idx in game.consider )
        {
            game.consider[data.idx].visible = true;
            tell_game(game);
            changes = true;
        }
    });

    // player has chosen their favorite card/s
    socket.on('choose', function(data) {
        if( playerid != game.czar ) {
            console.log(playerlong + ' is not the Czar and is trying to choose');
            return;
        }

        if( game.state != 'select' ) {
            console.log(playerlong + ' is trying to choose during ' + game.state);
            return;
        }

        var idx = +data.idx;

        if( idx < 0 || idx >= game.consider.length ) {
            console.log(playerlong + ' is trying to choose a bad index');
            return;
        }

        game.state = 'bask';
        game.favorite = idx;
        game.time = process.hrtime()[0];
        var favid = game_p.consider[idx].playerid;
        players[favid].score++;
        game.favname = players[favid].name;
        bump_player(player);
        tell_game(game);
        changes = true;

        setTimeout(function(){ new_round(game); }, 10000);
    });

    // player has requested to abandon the round
    socket.on('abandon', function(data) {
        if( !game || game.state != 'select' || player.abandon )
            return;

        player.abandon = 1;
        maybe_abandon(game);
    });

    // player clicked Exit button in a game
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

    // player left or refreshed
    socket.on('disconnect', function() {
        player.gone = 1;
        console.log(playerlong + ' disconnected');
    });

    // create a new game in the lobby
    var create_game = function(data) {
        if( Object.keys(games).length > 1000 )
            return;

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
            favorite   : null,
            playerids  : [],
            consider   : []
        };

        game_p = games_p[gameid] = {
            pass: "" + data.game.pass,
            wlist: shuffle(wlist.slice()),
            blist: shuffle(blist.slice()),
            hands: {},
            consider: []
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
        reset_player(player);
        whatup_player(player);
    };
});

// things to do even if no messages come in
var heartbeat = function(){
    clearTimeout(heartto);

    for( var gameid in games )
        check_game(games[gameid]);

    for( playerid in players )
    {
        var player = players[playerid];
        if( player.gameid && games[player.gameid].state == 'gather' )
            player.idle++;
        tell_player(players[playerid]);
    }

    heartto = setTimeout( heartbeat, 9000 );
};

heartto = setTimeout( heartbeat, 2000 );

// check a game for problems and fix em
var check_game = function(game) {
    var hrtime = process.hrtime()[0];
    var game_p = games_p[game.gameid];
    game.secs = hrtime - game.time;

    // Check for stale games -- i.e. where a setTimeout never went off
    if( game.state == 'bask' && game.secs > 15 ) {
        new_round(game);
        console.log('Game "' + game.name + '" (' + game.gameid + ') went stale!');
    }

    // automatically call the round if possible
    if( game.state == 'gather' )
        callit(game, false);

    // delete unused games
    if( game.secs > 60*60*3 ) {
        delete_game(game);
    }
}

var delete_game = function(game) {
    var playerids = game.playerids;
    var gameid = game.gameid;
    delete games[gameid];
    delete games_p[gameid];

    for( var pidx in playerids ) {
        var playerid = playerids[pidx];
        var player = players[playerid];
        player.gameid = 0;
        tell_player(player);
    }
};

var maybe_abandon = function(game) {
    if( game.state != 'select' )
        return;

    var abandoners = 0;
    var numer = 0;
    var game_p = games_p[game.gameid];
    var denom = game_p.consider.length;
    var actives = [];

    for( var idx in game_p.consider )
        actives.push(game_p.consider[idx].playerid);

    for( var pidx in game.playerids ) {
        var playerid = game.playerids[pidx];
        var player = players[playerid];
        if( player.abandon ) {
            abandoners++;
            if( actives.indexOf(playerid) >= 0 )
                numer++;
        }
    }

    var oldratio = game.abandonratio;

    if( numer > 0 )
        game.abandonratio = '' + numer + ' / ' + denom;

    var idle_abandon = (abandoners >= 2 && game.secs > game.abandonsecs * 2);
    var active_abandon = (numer >= 2 && game.secs > game.abandonsecs);
    var instant_abandon = (numer >= denom);

    if( idle_abandon || active_abandon || instant_abandon ) {
        // return cards
        for( var idx in actives ) {
            var playerid = actives[idx];
            var hand = game_p.hands[playerid];

            for( var c in game.consider[idx].cards )
                for( var h = 0; h < 13; h++ )
                    if( !hand[h] ) {
                        hand[h] = game.consider[idx].cards[c];
                        break;
                    }
        }

        console.log('Game "' + game.name + '" (' + game.gameid + ') being abandoned');
        game.state = 'bask';
        game.time = process.hrtime()[0];
        tell_game(game);
        changes = true;

        setTimeout(function(){ new_round(game); }, 10000);
    } else if( game.abandonratio != oldratio ) {
        tell_game(game);
        changes = true;
    }
};

// initialize player on first connect or game joins
var reset_player = function(player) {
    player.score = 0;
    player.idle = 0;
    player.gone = 0;
    player.abandon = 0;
    player.whatup = 0;
    player.time = process.hrtime()[0];
};

// figure out how many cards a player has up
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

// keep track of the last time we heard from a player
var bump_player = function(player) {
    player.time = process.hrtime()[0];
    player.idle = 0;
    player.gone = 0;
};

// send updates to all players in the lobby
var tell_lobby = function() {
    for( playerid in players )
        if( !players[playerid].gameid )
            tell_player(players[playerid]);
};

// send updates to all players in a game
var tell_game = function(game) {
    for( pidx in game.playerids ) {
        var p = game.playerids[pidx];
        tell_player(players[p]);
    }
};

// send updates to one player
var tell_player = function(player) {
    var socket = sockets[player.playerid];
    var hrtime = process.hrtime()[0];

    if( !socket || !socket.connected ) return;

    var game = player.gameid ? games[player.gameid] : null;
    var hand = player.gameid ? games_p[player.gameid].hands[player.playerid] : null;
    var lobby = player.gameid ? null : games;
    var playersout = [];

    if( game ) {
        game.secs = hrtime - game.time;

        for( pidx in game.playerids ) {
            var p = game.playerids[pidx];
            playersout.push(players[p]);
        }
    }

    socket.emit('state', {
        lobby: lobby,
        game: game,
        players: playersout,
        selfid: player.playerid,
        hand: hand,
        now: hrtime,
        version: version
    });
};

// begin a new round in a particular game
var new_round = function(game) {
    var game_p = games_p[game.gameid];
    var next = null;
    var winning = [];

    for( pidx in game.playerids ) {
        var playerid = game.playerids[pidx];
        var player = players[playerid];
        player.abandon = 0;

        if( game.high < player.score ) {
            winning = [player];
            game.high = player.score;
        } else if( game.high == player.score ) {
            winning.push(player);
        }

        if( !next || next.czartime > player.czartime || next.gone > player.gone )
            next = player;
    }

    var overtime = (game.round >= game.maxrounds || game.high >= game.goal);

    if( winning.length == 1 && overtime ) {
        game.state = 'champ';
        game.champ = get_champ_msg(winning[0]);
    } else {
        var blackid = game_p.blist.pop();
        game.black = cards[blackid];
        game.round++;
        game.state = 'gather';
        game.czar = next.playerid;
        next.czartime = process.hrtime()[0];
    }

    game.time = process.hrtime()[0];
    game.secs = 0;
    game.favorite = null;
    game.abandonratio = null;
    game.consider = [];
    game_p.consider = [];

    tell_game(game);
    changes = true;
};

// call it, if possible; collect any cards that are up and switch to 'select' state
var callit = function(game, human) {
    var secs = process.hrtime()[0] - game.time;
    var enough = 0;
    var potents = [];
    var game_p = games_p[game.gameid];
    game_p.consider = [];

    if( human && secs < 10 )
        return;

    if( !human && secs < game.roundsecs )
        return;

    if( !human && game.slowstart && game.round == 1 )
        return;

    // find if there are enough cards in
    for( pidx in game.playerids ) {
        var playerid = game.playerids[pidx];

        if( playerid == game.czar )
            continue;

        var hand = game_p.hands[playerid];
        var idxs = [];
        for( var i = 0; i < 3 && idxs.length < game.black.num; i++ ) {
            if( hand[i] )
                idxs.push(i);
        }

        if( idxs.length == game.black.num )
            potents.push({playerid: playerid, idxs: idxs});
    }

    // need at least two players in for the round
    if( potents.length < 2 )
        return;

    potents = shuffle(potents);

    // take those cards from players
    for( var i in potents ) {
        var pot = potents[i];
        var hand = game_p.hands[pot.playerid];
        var set = {visible: false, cards: []};
        var set_p = {playerid: pot.playerid};

        for( var j in pot.idxs ) {
            set.cards.push(hand[pot.idxs[j]]);
            hand[pot.idxs[j]] = null;
        }

        game.consider.push(set);
        game_p.consider.push(set_p);
        whatup_player(players[pot.playerid]);
    }

    game.state = 'select';
    game.time = process.hrtime()[0];
    tell_game(game);
};

// generate a game-over message
var get_champ_msg = function(player) {
    var msgs = [
        '%n cheated!',
        'Cheats detected on %n\'s computer!',
        '%n had the best cheats',
        '%n only had to cheat a little to win',
        '%n cheated the most',
        '%n was probably just cheating',
        'Nice cheats, %n',
        'No one cheated as well as %n',
        'Someone check %n for cheats',
        '%n was cheating and then won. Coincidence?',
        '%n cheated %s times',
        '%n: enjoy your points. You won all %s of them fairly, after all.',
        '%s cheers* for %n! (*cheats)',
        '%s points? Sounds like a cheater\'s score, %n',
    ];
    var i = Math.floor(Math.random() * msgs.length);
    return msgs[i].replace('%n', player.name).replace('%s', player.score);
};

// return input array, shuffled without bias
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

// parse a string from a Cookie: header
function parse_cookies(str) {
    var out = {};
    str && str.split(';').forEach(function(x) {
        var parts = x.split('=');
        out[parts.shift().trim()] = unescape(parts.join('=').replace('+',' '));
    });
    return out;
}

// vim: sw=4 ts=4 et
