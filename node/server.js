var util = require('util');
var http = require('http').Server(/* handler */);
var io = require('socket.io')(http);
var fs = require('fs');
var port = 1337;
var cardfile = 'cards.tab';
var cachefile = 'cache/save.json';
var version = 4;

var init = 0;
var games = {};
var games_p = {}; // private stuff -- don't send to clients
var num_games = 0;
var cards = {};
var wlist = [];
var blist = [];
var players = {};
var num_players = 0;
var sockets = {};
var maxgameid = 0;
var changes = false;
var heartto = null;
var terminating = false;

var roundsecs = 180;
var abandonsecs = 60;

var autosave = function(signal) {
    if( terminating ) return;
    if( !signal ) setTimeout(autosave, 60000);

    var die = function() {
        // for compatibility with nodemon
        if( signal == 'SIGUSR2' )
            process.kill(process.pid, signal);
        else
            process.exit();
    };

    if( signal ) {
        if( init != 2 ) die();
        terminating = true;
        util.log('Caught ' + signal + '. Saving...');
    } else if( !changes || init != 2 ) {
        return;
    }

    changes = false;

    var saveme = {
        games: games,
        games_p: games_p,
        players: players,
        maxgameid: maxgameid
    };

    fs.writeFile(cachefile, JSON.stringify(saveme), {mode: 0660}, function(err) {
        if( err ) util.log(err);
        if( !signal ) return;
        util.log('Save complete. Exiting.');
        die();
    });
};

setTimeout(autosave, 60000);
process.on('SIGINT', function() { autosave('SIGINT'); });
process.on('SIGTERM', function() { autosave('SIGTERM'); });
process.once('SIGUSR2', function() { autosave('SIGUSR2'); });

fs.readFile(cardfile, {encoding: 'utf8'}, function(err, data) {
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
            util.log(cardfile + ': ' + err + 'on line ' + cardid);
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

fs.readFile(cachefile, {encoding: 'utf8'}, function(err, data) {
    init++;

    if( err ) {
        util.log("Could not open save file: " + cachefile);
        return;
    }

    try {
        data = JSON.parse(data);
    } catch(e) {
        util.log("Could not parse save file: " + cachefile);
    }

    games = data.games || {};
    games_p = data.games_p || {};
    players = data.players || {};
    maxgameid = data.maxgameid || 0;
    num_games = Object.keys(games).length;
    num_players = Object.keys(players).length;

    util.log("Loaded " + num_games + " games");
    util.log("Loaded " + num_players + " players");
    util.log("Max game id: " + maxgameid);
});

http.listen(port, function() {
    util.log('Listening on ' + port);
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
        util.log('Connection before init!');
        socket.emit('state', {msg: 'Server not ready. Please wait and refresh.'});
        socket.disconnect();
        return;
    }

    // get logged-in state from cookies
    var cookies = parse_cookies(socket.handshake.headers.cookie);
    playerid = +cookies['sj_id'] || +cookies['sj_t_id'];
    playername = cookies['sj_name'] || cookies['sj_t_name'];

    if( !playerid ) {
        util.log('Client is not logged in: ' + socket.id);
        socket.emit('state', {msg: 'Please <a href=../!login.php?return=sah>login</a> to play'});
        socket.disconnect();
        return;
    }

    // FIXME remove -- this is just for old cookies
    if( !playername )
        playername = 'Player ' + playerid;

    playerlong = playername + ' (' + playerid + ')';

    if( !(playerid in sockets) )
        sockets[playerid] = [];
    sockets[playerid].push(socket);

    // existing player, or new one?
    if( playerid in players ) {
        player = players[playerid];
        player.name = playername;
        game = games[player.gameid] || {};
        game_p = games_p[player.gameid] || {};
        hand = game_p.hands ? game_p.hands[playerid] : [];
        util.log(playerlong + ' re-connected, ' + sockets[playerid].length + ' sockets');
    } else {
        player = {
            playerid: playerid,
            name: playername,
            gameid: 0,
            czartime: 0
        };
        reset_player(player);
        players[playerid] = player;
        num_players++;
        util.log(playerlong + ' connected, ' + sockets[playerid].length + ' sockets, ' + num_players + ' players');
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
            util.log(playerlong + ' cannot create game');
            socket.emit('state', {msg: 'Already in a game'});
            return;
        }

        if( !create_game(data) )
        {
            socket.emit('state', {msg: 'Too many games already!'});
            util.log(playerlong + ' tried to create a game when there are too many already');
            return;
        }

        join_game();
        player.czartime = game.time;
        new_round(game);
        bump_player(player);
        tell_player(player);
        tell_lobby();
        util.log(playerlong + ' created game "' + game.name + '" (' + game.gameid + '), ' + num_games + ' games');
        changes = true;
    });

    // player is trying to join a game
    socket.on('join', function(data) {
        if( !data.gameid || !games[data.gameid] ) {
            util.log(playerlong + ' tried to join non-existent game');
        } else if( player.gameid ) {
            util.log(playerlong + ' tried to join multiple games');
        } else {
            game = games[data.gameid];

            if( game.pass && data.pass != games_p[data.gameid].pass ) {
                util.log(playerlong + ' not allowed in game "' + game.name + '" (' + game.gameid + ')');
                socket.emit('state', {msg: 'Wrong password'});
                game = {};
            } else {
                game_p = games_p[game.gameid];
                join_game();
                bump_player(player);
                util.log(playerlong + ' joined game "' + game.name + '" (' + game.gameid + ')');
                changes = true;
            }
        }

        tell_game(game);
    });

    // player wants to draw a new card
    socket.on('draw', function(data) {
        var handcount = 0;
        var free = 0;
        var slot = +data.slot;

        for( var h = 0; h < 13; h++ ) {
            if( hand[h] && hand[h].cardid )
                handcount++;
            else if( h > 2 && !free )
                free = h;
        }

        if( hand[slot] && hand[slot].cardid )
            slot = free;

        if( handcount < 10 ) {
            var cardid = game_p.wlist.pop();
            hand[slot] = cards[cardid];
        }

        bump_player(player);
        tell_player(player);
        changes = true;
    });

    // player moved a card to a new position
    socket.on('move', function(data) {
        var slot = +data.slot;
        if( slot < 0 || slot > 12 ) {
            util.log(playerlong + ' tried to move to invalid slot ' + data.slot);
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

        var mintime = process.hrtime()[0] - roundsecs + 5;
        if( game.time < mintime )
            game.time = mintime;
        whatup_player(player);
        bump_player(player);
        tell_game(game);
        changes = true;
    });

    // player clicked Call It button
    socket.on('callit', function(data) {
        if( playerid != game.czar && !game.testmode ) {
            util.log(playerlong + ' is not the Czar and is trying to call');
            return;
        }

        if( game.state != 'gather' ) {
            util.log(playerlong + ' is trying to call during ' + game.state);
            return;
        }

        callit(game, true);
    });

    // player clicked to reveal card/s
    socket.on('reveal', function(data) {
        if( playerid != game.czar && !game.testmode ) {
            util.log(playerlong + ' is not the Czar and is trying to reveal');
            return;
        }

        if( game.state != 'select' ) {
            util.log(playerlong + ' is trying to reveal during ' + game.state);
            return;
        }

        var idx = +data.idx;

        if( idx in game.consider )
        {
            if( !game.consider[idx].visible )
                game.time = process.hrtime()[0];

            game.consider[idx].visible = true;

            game.revealed = idx;
            tell_game(game);
            game.revealed = -1;

            changes = true;
        }
    });

    // player has chosen their favorite card/s
    socket.on('choose', function(data) {
        if( playerid != game.czar && !game.testmode ) {
            util.log(playerlong + ' is not the Czar and is trying to choose');
            return;
        }

        if( game.state != 'select' ) {
            util.log(playerlong + ' is trying to choose during ' + game.state);
            return;
        }

        var idx = +data.idx;

        if( idx < 0 || idx >= game.consider.length ) {
            util.log(playerlong + ' is trying to choose a bad index');
            return;
        }

        var favid = game_p.consider[idx].playerid;

        // record history
        game.history.push({
            name: players[favid].name,
            black: game.black,
            white: game.consider[idx].cards,
        });

        game.state = 'bask';
        game.favorite = idx;
        game.time = process.hrtime()[0];
        players[favid].score++;
        game.roundmsg = get_round_msg(players[favid]);
        bump_player(player);
        tell_game(game);
        changes = true;

        setTimeout(function(){ new_round(game); }, game.testmode ? 1000 : 10000);
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
            util.log(playerlong + ' left game "' + game.name + '" (' + game.gameid + ')');

            game = {};
            game_p = {};
        }

        tell_player(player);
        changes = true;
    });

    // player left or refreshed
    socket.on('disconnect', function() {
        for( var s in sockets[playerid] ) {
            if( socket != sockets[playerid][s] )
                continue;
            sockets[playerid].splice(s, 1);
            break;
        }

        player.gone = 1;
        util.log(playerlong + ' disconnected, ' + sockets[playerid].length + ' sockets remain');
    });

    // create a new game in the lobby
    var create_game = function(data) {
        if( num_games > 1000 )
            return false;

        num_games++;

        var gameid = ++maxgameid;
        game = games[gameid] = {
            gameid     : gameid,
            name       : "" + data.game.name,
            pass       : data.game.pass ? 1 : 0,
            goal       : +data.game.goal || 11,
            maxrounds  : +data.game.maxrounds || 55,
            rando      : data.game.rando ? 'R' + gameid : false,
            testmode   : data.game.testmode ? 1 : 0,
            state      : 'gather',
            time       : process.hrtime()[0],
            secs       : 0,
            round      : 0,
            high       : 0,
            czar       : 0,
            revealed   : -1,
            favorite   : null,
            playerids  : [],
            consider   : [],
            history    : [],
            final      : []
        };

        game_p = games_p[gameid] = {
            pass: "" + data.game.pass,
            wlist: shuffle(wlist.slice()),
            blist: shuffle(blist.slice()),
            hands: {},
            consider: []
        };

        if( game.rando )
            add_rando(game);

        return true;
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

    num_games = Object.keys(games).length;

    for( var gameid in games )
        check_game(games[gameid]);

    for( playerid in players )
    {
        var player = players[playerid];
        if( !(player.gameid in games) )
            player.gameid = 0;
        if( player.gameid && games[player.gameid].state == 'gather' )
            player.afk++;
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
        util.log('Game "' + game.name + '" (' + game.gameid + ') went stale!');
    }

    // automatically call the round if possible
    if( game.state == 'gather' ) {
        var czar = players[game.czar];

        if( !czar || (czar.gone && czar.afk > 4) || czar.gameid != game.gameid )
            new_czar(game);
        else
            callit(game, false);

        if( game.rando )
            play_rando(game);
    }

    // delete unused games
    if( game.secs > 60*60*(num_games > 100 ? 3 : 24) ) {
        delete_game(game);
    }
}

// delete a game, kicking everyone out
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

        if( player.synthetic ) {
            delete players[playerid];
            num_players--;
        }
    }

    num_games--;
};

// abandon the round if there are enough votes
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

    var idle_abandon = (abandoners >= 2 && game.secs > abandonsecs * 2);
    var active_abandon = (numer >= 2 && game.secs > abandonsecs);
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

        util.log('Game "' + game.name + '" (' + game.gameid + ') being abandoned');
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

var add_rando = function(game) {
    util.log('Adding Rando to "' + game.name + '" (' + game.gameid + ')');
    var game_p = games_p[game.gameid];
    var playerid = game.rando;

    player = {
        playerid: playerid,
        name: 'Rando',
        gameid: game.gameid,
        czartime: 0,
        synthetic: 1,
    };

    players[playerid] = player;
    num_players++;
    reset_player(player);
    game.playerids.push(playerid);
    game_p.hands[playerid] = [];
    sockets[playerid] = [];
};

var play_rando = function(game) {
    var game_p = games_p[game.gameid];
    var player = players[game.rando];
    var hand = game_p.hands[game.rando];
    whatup_player(player);

    if( player.whatup < game.black.num ) {
        for( var h = 0; h < game.black.num; h++ ) {
            if( !hand[h] || !hand[h].cardid ) {
                var cardid = game_p.wlist.pop();
                hand[h] = cards[cardid];
            }
        }

        whatup_player(player);
        bump_player(player);
        tell_game(game);
    }
};

// initialize player on first connect or game joins
var reset_player = function(player) {
    player.score = 0;
    player.idle = 0;
    player.afk = 0;
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
    player.afk = 0;
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
    var hrtime = process.hrtime()[0];
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

    for( var s in sockets[player.playerid] ) {
        var socket = sockets[player.playerid][s];
        if( !socket || !socket.connected )
            continue;

        socket.emit('state', {
            lobby: lobby,
            game: game,
            players: playersout,
            selfid: player.playerid,
            hand: hand,
            now: hrtime,
            version: version
        });
    }
};

// begin a new round in a particular game
var new_round = function(game) {
    var game_p = games_p[game.gameid];
    var winning = [];

    for( pidx in game.playerids ) {
        var playerid = game.playerids[pidx];
        var player = players[playerid];
        player.abandon = 0;

        // check for highest score
        if( game.high < player.score ) {
            winning = [player];
            game.high = player.score;
        } else if( game.high == player.score ) {
            winning.push(player);
        }
    }

    var overtime = (game.round >= game.maxrounds || game.high >= game.goal);

    // can only end game if no tie for first place
    if( winning.length == 1 && overtime ) {
        game.state = 'champ';
        game.champ = get_champ_msg(winning[0]);
        game.pass = 0;
        game_p.pass = '';

        for( pidx in game.playerids ) {
            var playerid = game.playerids[pidx];
            var player = players[playerid];
            game.final.push({playerid: playerid, name: player.name, score: player.score});
        }
        game.final = game.final.sort(function(a,b){ return a.score < b.score; });
    } else {
        var blackid = game_p.blist.pop();
        game.black = cards[blackid];
        game.round++;
        game.state = 'gather';
        new_czar(game);
    }

    game.time = process.hrtime()[0];
    game.secs = 0;
    game.favorite = null;
    game.abandonratio = null;
    game.revealed = -1;
    game.consider = [];
    game_p.consider = [];

    tell_game(game);
    changes = true;
};

var new_czar = function(game) {
    var next = null;

    for( pidx in game.playerids ) {
        var playerid = game.playerids[pidx];
        var player = players[playerid];

        if( player.synthetic )
            continue;

        if( !next ) {
            next = player;
        } else {
            var cmp = function(x, y) { return x == y ? 0 : x > y ? 1 : -1; };

            var score = cmp(next.czartime, player.czartime) *   1
                      + cmp(next.idle    , player.idle    ) *  10
                      + cmp(next.gone    , player.gone    ) * 100;

            if( score > 0 )
                next = player;
        }
    }

    if( next ) {
        game.czar = next.playerid;
        next.czartime = process.hrtime()[0];
    }
};

// call it, if possible; collect any cards that are up and switch to 'select' state
var callit = function(game, human) {
    var secs = process.hrtime()[0] - game.time;
    var enough = 0;
    var potents = [];
    var impotents = [];
    var game_p = games_p[game.gameid];
    game_p.consider = [];

    if( !human && game.testmode )
        return;

    if( human && !game.testmode && secs < 10 )
        return;

    if( !human && secs < roundsecs )
        return;

    if( !human && game.round == 1 )
        return;

    // find if there are enough cards in
    for( pidx in game.playerids ) {
        var playerid = game.playerids[pidx];

        if( playerid == game.czar && !game.testmode )
            continue;

        var hand = game_p.hands[playerid];
        var idxs = [];
        for( var i = 0; i < 3 && idxs.length < game.black.num; i++ ) {
            if( hand[i] )
                idxs.push(i);
        }

        if( idxs.length == game.black.num )
            potents.push({playerid: playerid, idxs: idxs});
        else
            impotents.push({playerid: playerid, idxs: idxs});
    }

    // need at least two players in for the round
    if( potents.length < 2 && !game.testmode )
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
        players[pot.playerid].idle = 0;
        whatup_player(players[pot.playerid]);
    }

    // worthless idlers!
    for( var i in impotents ) {
        var impot = impotents[i];
        players[impot.playerid].idle++;
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
        '%s "cheers"* for %n! (*cheats)',
        '%s points? Sounds like a cheater\'s score, %n',
    ];
    var i = Math.floor(Math.random() * msgs.length);
    return msgs[i].replace('%n', player.name).replace('%s', player.score);
};

// generate a round-over message
var get_round_msg = function(player) {
    var game = games[player.gameid];
    var msgs = [];

    if( player.score > game.high && game.high > 0 )
        msgs = [
            '%n is getting away with this!',
            '%n is kicking our butts!',
            '%n wins this one. As usual.',
            '%n will probably win the whole thing.',
            'Surprise! Point goes to %n!',
            '%n fortifies superiority.',
            '%n just keeps winning!',
            '%s smackaroos for %n!',
            '*Thundering boom* ... %n.',
        ];
    else if( player.score == game.high )
        msgs = [
            '%n joins Club %s.',
            '%n ties it up.',
            'A wily %n approaches.',
            '%n with the upset!',
            '%n has no respect for the establishment!',
            '%n really wants to win!',
            'Oh great. %n won.',
            'The scent of %n fills the room.',
        ];
    else if( player.score == 1 && game.high > 0 )
        msgs = [
            '%n pulling into last!',
            '%n has decided to actually play?!',
            '%n makes a little squeaky noise.',
            '%n can come too?',
            'Did you know %n was playing?',
            'Point for %n! Point! One point.',
            '%n is doing so well!',
            'Awww! %n got a point. Cute!',
        ];
    else
        msgs = [
            'A favorite is %n!',
            'A winner is %n!',
            '%n is the chosen one.',
            '%n puts this round in that mouth and eats it.',
            '%n has accumulated %s points!',
            'Picking %n\'s card? Bold move.',
            'A little beam of light shines on %n.',
            '%n laughs and poots.',
            '%n giggles and gets a point.',
            '%n turns %s!',
            'It is a good day to be %n.',
            'Fortune smiles upon %n.',
            '%n shares this win with all humanity!',
            '%n wanted it the baddest!',
            '%n is very special.',
            '%n was the only one with good cards.',
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
        out[parts.shift().trim()] = unescape(parts.join('=').replace(/\+/g, ' '));
    });

    return out;
}

// vim: sw=4 ts=4 et
