var version = null;
var to = null;
var game = null;
var black = null;
var $clock = null;
var clock = 0;
var players = [];
var amczar = false;
var enough = 0;
var nonczars = 0;
var czar = 'No one';
var movement = 0;
var chosen = 0;
var myscore = 0;
var selfid = 0;
var pullbardown = false;

var blinkto = null;
var blinkcolor = '';
var blinking = false;

var url = 'http://www.superjer.com:1337/';
var socket = io.connect(url);

var roundsecs = 180;
var abandonsecs = 60;

function dropme($x) {
    $x.droppable({
        tolerance: "intersect",
        drop: function(event, ui) {
            var $slot = $(event.target).first();
            var $card = $(ui.draggable);
            movecardto($card, $slot);
        }
    });
}

function movecardto($card, $slot) {
    movement++;
    var $parent = $card.parent();

    $parent.append($slot.replaceWith($card));
    dropme($slot);
    $card.css({top:0, left:0});

    checkin({
        action: 'move',
        cardid: +$card.attr('cardid'),
        slot:   +$card.parent().attr('slot'),
    });
}

function dragme($x) {
    $x.draggable({
        revert: "invalid",
        stack: ".draggable",
    }).disableSelection();
    $x.click(function(){
        var slot = $x.parent().attr('slot');
        var start = slot < 3 ? 3 : 0;
        for( var i = start; i < 13; i++ ) {
            var $slot = $('.hasslot[slot=' + i + '] .slot');
            if( $slot.length ) {
                movecardto($x, $slot);
                return;
            }
        }
    });
}

function checkin( json ) {
    clearTimeout(to);
    to = setTimeout(checkin, 5000);

    if( typeof json == 'undefined' ) {
        if( !movement )
            return;
        json = { action: 'check' };
    }

    json.movement = movement;
    movement = 0;
    socket.emit( json.action, json );
}

socket.on('state', function(d){
    if( d.msg ) {
        err(d.msg);
        return;
    }

    if( d.cookies ) {
        $('input.yourname').val(d.yourname);
        for( var i in d.cookies )
            document.cookie = d.cookies[i];
        return;
    }

    if( version === null )
        version = d.version;

    if( version != d.version ) {
        window.location.reload();
        return;
    }

    if( d.lobby ) {
        lobby = d.lobby;
        game = null;
        $('.win').hide();
        $('.lobbywin, .shade').show();
        list_games();
        pullbardown = false;
        fixall(0);
        return;
    }

    if( $('.lobbywin').is(':visible') )
        $('.lobbywin, .shade').hide();

    var statechange = (!game || d.game.state != game.state);
    game = d.game;

    if( statechange ) {
        $('.roomname').text(game.name);
        $('.roundstatus').text(game.round + ' of ' + game.maxrounds);
        $('.scorestatus').text(game.high + ' / ' + game.goal);
    }

    if( clock - 1 != game.secs )
        clock = game.secs;

    if( !black || game.black.cardid != black.cardid || game.black.txt != black.txt ) {
        black = game.black;
        var $black = $('.blackcard');
        $black.find('.cardtxt').html(make_blanks_html(black.txt));
        $black.find('.num div').text(black.num);
    }

    var handcount = 0;

    for( var h in d.hand )
        if( d.hand[h] && d.hand[h].cardid )
            handcount++;

    if( handcount < 10 )
        $('.hand').addClass('drawable');
    else
        $('.hand').removeClass('drawable');

    if( true ) { // TODO?! skip if nothing has changed (likely)
        var html = "";
        enough = 0;
        nonczars = d.players.length - 1;
        amczar = false;
        selfid = d.selfid;

        for( var i in d.players ) {
            var pl = d.players[i];
            var myself = (pl.playerid == selfid);

            if( pl.idle > 1 && pl.gone && pl.score < 1 && !myself )
                continue;

            var classes = "";
            var plczar = (game.czar == pl.playerid);

            if( myself ) {
                myscore = pl.score;
                classes += " myself";
                if( plczar )
                    amczar = true;
            }

            if( plczar ) {
                czar = pl.name;
                classes += " czar";
            } else if( pl.whatup >= black.num ) {
                enough++;
            }

            var whatup = (pl.gone ? 'Out' : pl.idle ? 'Idle' : plczar ? 'Czar' : pl.whatup);
            var title = (pl.idle ? 'title="Idle for ' + pl.idle + ' turns"' : '');
            html += '<tr class="' + classes + '" ' + title + '><td>' + pl.name
                 +  '</td><td>' + pl.score
                 +  '</td><td>' + whatup
                 +  '</td></tr>';
        }

        if( statechange || game.state != 'champ' )
            $('.scoresheet tbody').html(html);

        if( amczar && game.state == 'gather' ) {
            $('.callit').css('display', '');
            $('.play').addClass('czarbg');
        } else {
            $('.callit').css('display', 'none');
            $('.play').removeClass('czarbg');
        }

        var enoughtext = '';
        if( enough >= 1 && nonczars > 1 )
            enoughtext = ' (' + enough + '/' + nonczars + ')';

        if( enough >= 2 ) {
            $('.callit').text('Call it' + enoughtext);
            $('.callit').removeAttr('disabled');
        } else {
            $('.callit').text('Waiting for players' + enoughtext);
            $('.callit').attr('disabled', true);
        }

        if( game.testmode )
            $('.callit').css('display', '').text('Call it (test)').removeAttr('disabled');

        if( amczar && enough >= 2 && enough == nonczars ) {
            if( !blinking )
                blinkfunc();
        } else {
            blinking = false;
            blinkcolor = '';
            clearTimeout(blinkto);
            $('.callit').css('background-color', blinkcolor);
        }
    }

    if( statechange ) switch( game.state ) {
        case 'gather':
            $('.win, .shade').hide();
            $('.draggable').draggable('enable');
            break;

        case 'champ':
            show_final_scores();
            show_history();
            $('.champwin h1').text(game.champ);
            $('.win').hide();
            $('.champwin, .shade').show();
            break;

        default:
            pullbardown = false;
            fixall(0);
            $('.selectwin, .shade').show();
            $('.abandon').css('display','none').removeAttr('disabled').text('Abandon');
            $('.confirm').css('display','none').attr('disabled',true);
            $('.draggable').draggable('disable');
            $('.wintitle').text( amczar ? 'You are the Czar. Choose your favorite:' : 'Waiting for Czar ' + czar + ' to choose...' );
    }

    if( game.state == 'select' && amczar ) {
        $('.confirm').css('display','block');
        $('.selectwin .leave').hide();
    } else {
        $('.selectwin .leave').show();
    }

    if( game.state == 'select' && clock > abandonsecs && !amczar ) {
        $('.abandon').css('display','block');

        if( game.abandonratio )
            $('.abandon').text(game.abandonratio);
    }

    for( var i = 0; i < 13; i++ ) {
        var card = d.hand[i];
        var $card = $('.hasslot[slot=' + i + '] .card');

        if( !card ) {
            $card.replaceWith("<div class='card slot slotnew'></div>");
            dropme( $('.slotnew').removeClass('slotnew') );
            continue;
        }

        if( card.cardid == $card.attr('cardid') )
            continue;

        var r = 0, g = 0, b = 0;
        var seed = card.cardid;

        while( r*0.2126 + g*0.7152 + b*0.0722 < 150 ) {
            r = Math.abs(Math.floor(Math.sin(seed+=10000) * 10000)) % 256;
            g = Math.abs(Math.floor(Math.sin(seed+=10000) * 10000)) % 256;
            b = Math.abs(Math.floor(Math.sin(seed+=10000) * 10000)) % 256;
        }

        var color = ' style="background-color: rgb('+r+','+g+','+b+')"';
        color = '';
        var $elem = $(
            '<div class="card draggable" cardid=' + card.cardid + color + '>'
            +   '<div class=cardtxt>' + pretty_white(card.txt) + '</div>'
            + '</div>'
        );

        $card.replaceWith($elem);
        dragme($elem);
    }

    if( game.state != 'gather' ) {
        maybe_repopulate();

        if( typeof game.favorite == 'number' ) {
            $('.aset').removeClass('potential');
            $('.aset[idx=' + game.favorite + ']').addClass('favorite');
            $('.wintitle').text(game.roundmsg);
        } else if( game.state == 'bask' ) {
            $('.wintitle').text('Round abandoned; cards will be returned.');
        }
    }

    fixall(0);
});

function list_games() {
    var html = '';

    $('.lobbywin tr').attr('hit', 0);
    $('.lobbywin tr').eq(0).attr('hit', 1);

    for( var l in lobby )
    {
        var lob = lobby[l];
        var trsel = '.lobbywin tr[gameid=' + lob.gameid + ']';
        var status = lob.state == 'champ' ? 'game over' :
                     lob.secs > 600       ? 'crickets'  :
                     lob.secs > 240       ? 'simmer'    :
                                            'active'    ;

        if( l > 1000 )
            break;

        if( $('input.activeonly').is(':checked') && status != 'active' && status != 'simmer' )
            continue;

        var filter = $('input.filter').val().split(' ');
        var valids = 0;
        var matches = 0;

        for( var x in filter ) {
            var word = filter[x].toLowerCase();

            if( word.length < 1 )
                continue;

            valids++;

            if( lob.name.toLowerCase().indexOf(word) > -1 )
                matches++;
        }

        if( valids > matches )
            continue;

        var round = lob.round < 2 ? 'new' : '' + lob.round + numberth(lob.round);
        var players = playericons(lob.playerids.length);

        if( $(trsel).length == 0 )
            $('.lobbywin table tbody').append($(
                  "<tr gameid=" + lob.gameid + " pass=" + lob.pass + ">"
                + Array(7).join("<td></td>")
                + "</tr>"
            ));

        $(trsel).attr('hit', 1);
        var $td = $(trsel).find('td');
        $td.eq(0).html(lob.name + (lob.pass ? ' <span class=key>⚷</span>' : ''));
        $td.eq(1).text(round);
        $td.eq(2).text(players);
        $td.eq(3).text(lob.high);
        $td.eq(4).text(round + ', ' + players + ', ' + status);
        $td.eq(5).text(status);
    }

    // remove any games that no longer exist
    $('.lobbywin tr[hit=0]').remove();

    if( lobby.length == 0 )
        $('.norooms').show();
    else
        $('.norooms').hide();
}

function maybe_repopulate() {
    var ttlcons = 0;
    var repop = false;
    var $cons = $('.contenders');

    for( var i in game.consider ) {
        for( var j in game.consider[i].cards ) {
            ttlcons++;
            var seltor = '[cardid=' + game.consider[i].cards[j].cardid + ']';
            if( $cons.find(seltor).length < 1 )
                repop = true;
        }
    }

    if( ttlcons != $cons.find('.card').length )
        repop = true;

    if( !repop ) {
        for( var i in game.consider )
            if( game.consider[i].visible ) {
                var $unmystify = $('.aset[idx=' + i + ']');
                $unmystify.removeClass('mystery');

                if( game.revealed == i && !amczar ) {
                    $('.aset').removeClass('potential');
                    $unmystify.addClass('potential');
                    black_insert($unmystify);
                }
            }

        return;
    }

    $cons.html('');

    for( var i in game.consider ) {
        var $cont = $('<div class=aset></div>');
        $cont.attr('idx', i);

        if( !game.consider[i].visible )
            $cont.addClass('mystery');

        for( var j in game.consider[i].cards ) {
            var card = game.consider[i].cards[j];
            var $elem = $(
                "<div class=card>" +
                "  <div class=cardtxt></div>" +
                "<div>"
            );

            $elem.attr('cardid', card.cardid);
            $elem.attr('raw', card.txt);
            $elem.find('.cardtxt').text(pretty_white(card.txt));
            $cont.append($elem);
        }

        $cons.append($cont);
    }

    $('.aset').click(function(event) {
        var $aset = $(this);
        var $cards = $aset.find('.card');
        var idx = $aset.attr('idx');

        if( !amczar && $aset.hasClass('mystery') )
            return;

        $('.aset').removeClass('potential');
        $aset.addClass('potential');
        black_insert($aset);

        if( !amczar )
            return;

        $aset.removeClass('mystery');

        if( $('.selectwin .mystery').length < 1 )
            $('.confirm').removeAttr('disabled');

        checkin( {action:'reveal', idx:idx} );
        chosen = idx;
    });

    $('.selectwin .blackcard').click(function(event) {
        chosen = 0;
        $('.aset').removeClass('potential');
        $('.selectwin .blackcard .cardtxt').html(make_blanks_html(black.txt));
    });
}

// fix all elements that may have gotten out of position
function fixall(animtime) {
    if( window.screen.availHeight ) {
        $('.sshelper').css('max-height', window.screen.availHeight - 150);
    }

    var $ss = $('.scoresheet');
    var anim = pullbardown ? {top: 0} : {top: 30 - $ss.height()};

    if( animtime )
        $ss.animate(anim, animtime);
    else
        $ss.css(anim);
}

function show_final_scores() {
    var html = '';

    for( var i in game.final ) {
        var row = game.final[i];
        var cls = row.playerid == selfid ? 'class=myself' : '';
        html += '<tr ' + cls + '><td>' + row.name
             + '</td><td class=rt>' + row.score
             + '</td></tr>';
    }

    $('.final').html(html);
};

function show_history() {
    $('.history').empty();

    for( var i in game.history ) {
        var row = game.history[i];
        var html = make_blanks_html(row.black.txt);
        var $tr = $('<tr><td>' + (+i + 1)
                  + '</td><td>' + row.name
                  + '</td><td>' + html
                  + '</td></tr>');

        var raws = [];
        for( var w in row.white )
            raws.push(row.white[w].txt);

        black_insert_inner($tr, raws);
        $('.history').append($tr);
    }
};

function err(s) {
    $('.err span').html(s);
    $('.err').show()
        .css({'background-color': 'yellow',color: 'black'})
        .animate({'background-color': 'red',color: 'white'});
}

function make_blanks_html(txt) {
    return txt.replace(
        /_({([^}]+)})?/g,
        '<span class=blank flags="$2">________</span>'
    );
}

function black_insert($aset) {
    var $bct = $('.selectwin .blackcard .cardtxt');
    var $wcts = $aset.find('.card');
    var raws = [];
    $wcts.each(function() { raws.push($(this).attr('raw')); });
    black_insert_inner($bct, raws);
}

function black_insert_inner($bct, raws) {
    var i = 0;
    $bct.find('.blank').each(function() {
        var raw = raws[i];
        var flags = $(this).attr('flags');

        // uppercase first letter
        if( flags.indexOf('U') > -1 )
            raw = raw.charAt(0).toUpperCase() + raw.slice(1);

        // uppercase EVERYTHING
        if( flags.indexOf('UU') > -1 )
            raw = raw.toUpperCase();

        // lowercase all
        if( flags.indexOf('u') > -1 )
            raw = raw.toLowerCase();

        // title case
        if( flags.indexOf('T') > -1 )
            raw = titlecase(raw);

        // convert non-alphanum to dashes (like in a domain)
        if( flags.indexOf('-') > -1 )
            raw = raw.replace(/[^A-Za-z0-9]+/g, '-');

        // strip trailing punctuation
        if( flags.indexOf('.') > -1 )
            raw = raw.replace(/[!?.]+$/, '-');

        $(this).text(raw);

        if( i + 1 < raws.length )
            i++;
    });
}

function pretty_white(txt) {
    return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function titlecase(txt) {
    var lowwords = [
        'a', 'an', 'the',
        'and', 'but', 'or', 'nor', 'for', 'yet', 'so',
        'as', 'at', 'by', 'from', 'in', 'into', 'like', 'of', 'off', 'on', 'onto', 'out',
        'over', 'per', 'sans', 'than', 'till', 'to', 'unto', 'up', 'upon', 'via', 'with'
    ];

    var list = txt.split(/\s+/);
    txt = "";

    for( var i in list ) {
        var word = list[i];
        if( i == list.length - 1 || lowwords.indexOf(word.toLowerCase()) == -1 )
            txt += word.charAt(0).toUpperCase() + word.slice(1) + " ";
        else
            txt += word + " ";
    }

    return txt.trim();
}

function blinkfunc() {
    clearTimeout(blinkto);
    blinking = true;
    blinkcolor = blinkcolor ? '' : '#f7d700';
    $('.callit').css('background-color', blinkcolor);
    blinkto = setTimeout(blinkfunc, 1000);
};

$(function() {
    var rapidclicks = 0;

    dropme($(".slot"));
    dragme($(".draggable"));
    checkin();
    $clock = $('.clock');

    setInterval(function(){
        clock++;
        var clocklim = 0;

        if( !game )
            ;
        else if( game.state == 'gather' )
            clocklim = roundsecs;
        else if( game.state == 'select' )
            clocklim = abandonsecs;
        else if( game.state == 'bask' )
            clocklim = 10;

        if( !clocklim ) {
            $clock.text("0:00");
            return;
        }

        var rel = clocklim - clock;
        var mins = Math.floor(Math.abs(rel) / 60);
        var secs = Math.abs(rel) - mins * 60;
        $clock.text('' + mins + ':' + (secs < 10 ? '0' + secs : secs));
        $clock.css('color', rel < 0 ? '#d7005f' : '');

        if( rapidclicks > 0 )
            rapidclicks -= 2;
    }, 1002 );

    $('.reset').click(function() {
        checkin({action: 'reset'});
    });

    $('.callit').click(function() {
        checkin({action: 'callit'});
    });

    $('.hand').on('click', '.holder .slot', function() {
        var $holder = $(this).parent();
        $holder.addClass('drawing');
        checkin({action: 'draw', slot: $holder.attr('slot')});
        setTimeout(function() {
            $holder.removeClass('drawing');
        }, 2000);
    });

    $('.abandon').click(function() {
        checkin({action: 'abandon'});
        $('.abandon').attr('disabled', true);
    });

    $('.confirm').click(function() {
        checkin({action: 'choose', idx: chosen});
        $('.confirm').attr('disabled', true);
    });

    $('.leave').click(function() {
        var msg = 'Exit this room?';

        if( myscore == 1 )
            msg += ' You will lose your point!';
        else if( myscore > 1 )
            msg += ' You will lose your points!';

        if( game.state == 'champ' || confirm(msg) ) {
            checkin({action: 'leave'});
            quickly = true;
        }
    });

    $('.pullbar').on('click touchstart', function() {
        pullbardown = !pullbardown;
        fixall(300);
        return false;
    });

    $('.create').click(function() {
        var n = $('input#name');
        var p = $('input#pass');
        var goal = $('input#goal');
        var maxrounds = $('input#maxrounds');
        var rando = $('input#rando');
        var testmode = $('input#testmode');

        if( n.val() ) {
            checkin({
                action:'create',
                game:{
                    name: n.val(),
                    pass: p.val(),
                    goal: goal.val(),
                    maxrounds: maxrounds.val(),
                    rando: rando.is(':checked'),
                    testmode: testmode.is(':checked'),
                }
            });

            quickly = true;
            n.val('');
            p.val('');
            $('.jointab').click();
        }
    });

    $('input#rando').click(function() {
        rapidclicks++;
        if( rapidclicks >= 10 )
            $('label.testmode').slideDown();
    });

    $('.help').click(function() {
        var newwin = window.open(
            "./help.html", 'Help',
            'height=600,width=500,location=0,menubar=0,status=0,' +
            'toolbar=0,scrollbars=1,resizable=1,top=200,left=400'
        );

        if( window.focus )
            newwin.focus();

        return false;
    });

    $(document).on('click', '.lobbywin table tr', function() {
        var pass = '';

        if( $(this).attr('pass') == '1' ) {
            pass = prompt('Enter password');
            if( typeof pass != 'string' )
                return;
        }

        checkin({
            action: 'join',
            gameid: $(this).attr('gameid'),
            pass: pass
        });
    });

    $('.profiletab').click(function() {
        $('.lobbywin li').removeClass('selected');
        $(this).addClass('selected');
        $('.lobbywin .page').hide();
        $('.profilepage').show();
    });

    $('.jointab').click(function() {
        $('.lobbywin li').removeClass('selected');
        $(this).addClass('selected');
        $('.lobbywin .page').hide();
        $('.joinpage').show();
    });

    $('.createtab').click(function() {
        $('.lobbywin li').removeClass('selected');
        $(this).addClass('selected');
        $('.lobbywin .page').hide();
        $('.createpage').show();
    });

    $('input.yourname').on('change', function() {
        checkin({
            action: 'rename',
            newname: $(this).val()
        });
    });

    $('input.activeonly').on('change', function() {
        list_games();
    });

    $('input.filter').on('change keyup', function(e) {
        if( e.keyCode == 13 )
            $(this).blur();
        else
            list_games();
    });

    $(document).on('mousemove click keydown', function() {
        movement++;
    });

    $('.err button').on('click', function() {
        $('.err').slideUp();
    });

    $(window).on('resize', function() { fixall(0); });
});

function numberth(n) {
    return n % 100 >= 11 && n % 100 <= 13 ? 'th' :
           n % 10 == 1                    ? 'st' :
           n % 10 == 2                    ? 'nd' :
           n % 10 == 3                    ? 'rd' :
                                            'th' ;
}

function playericons(n) {
    return n < 1 ? 'empty'              :
           n < 7 ? Array(n+1).join('⚇') :
                   '⚇×' + n             ;
}
// vim: ts=4 sw=4 et
