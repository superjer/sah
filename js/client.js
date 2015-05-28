var version = null;
var $xhr = null;
var to = null;
var clock = 0;
var $clock = null;
var game = null;
var quickly = false;
var players = [];
var handcount = -1;
var amczar = false;
var czar = 'No one';
var movement = 0;
var chosen = 0;
var blackid = 0;
var blacktxt = '';
var blackhtml = '';
var myscore = 0;

var url = 'http://www.superjer.com:1337/';
var socket = io.connect(url);

function dropme($x)
{
    $x.droppable({
        tolerance: "intersect",
        drop: function( event, ui ) {
            movement++;
            var $slot = $(event.target).first();
            var $card = $(ui.draggable);
            var $parent = $card.parent();
            $parent.append( $slot.replaceWith($card) );
            dropme( $slot );
            $card.css({top:0, left:0});
            json = {
                action:  'move',
                cardid:  +$card.attr('cardid'),
                slot:    +$card.parent().attr('slot'),
            };
            checkin(json);
        },
    });
}

function dragme($x)
{
    $x.draggable({
        revert: "invalid",
        stack: ".draggable",
    })
    .disableSelection();
}

function checkin( json )
{
    clearTimeout(to);

    if( typeof json == 'undefined' ) json = { action: 'check' };

    json.movement = movement;
    movement = 0;

    socket.emit( json.action, json );

    to = setTimeout(checkin, 15000);
}

socket.on('state', function(d){

    if( version === null )
        version = d.version;

    if( version != d.version ) { window.location.reload(); return; }

    if( d.msg ) { err( d.msg ); return; }

    console.log(d);

    if( d.lobby )
    {
        game = null;
        $('.win').hide();
        $('.lobbywin, .shade').show();
        $('.lobbywin tr').attr('hit', 0);
        $('.lobbywin tr').eq(0).attr('hit', 1);

        var html = '';

        for( var l in d.lobby )
        {
            var lob = d.lobby[l];
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

            var round = lob.round < 2                                  ? 'new'            :
                        lob.round % 100 >= 11 && lob.round % 100 <= 13 ? lob.round + 'th' :
                        lob.round % 10 == 1                            ? lob.round + 'st' :
                        lob.round % 10 == 2                            ? lob.round + 'nd' :
                        lob.round % 10 == 3                            ? lob.round + 'rd' :
                                                                         lob.round + 'th' ;

            var players = lob.playerids.length
            players = players < 1 ? 'empty'                        :
                      players < 7 ? new Array(players+1).join('⚇') :
                                    '⚇x' + players                 ;

            if( $(trsel).length == 0 )
                $('.lobbywin table tbody').append( $(
                    "<tr gameid=" + lob.gameid + ">"
                    + "<td></td>"
                    + "<td></td>"
                    + "<td></td>"
                    + "<td></td>"
                    + "<td></td>"
                    + "<td></td>"
                    + "<td>" + (lob.pass ? "<input type=text value='' placeholder=password>" : "") + "</td>"
                    + "<td><button gameid=" + lob.gameid + ">Join</button></td>"
                    + "</tr>"
                ) );

            $(trsel).attr('hit', 1);
            var $td = $(trsel).find('td');
            $td.eq(0).html( lob.name + (lob.pass ? ' <span class=key>⚷</span>' : '') );
            $td.eq(1).text( round );
            $td.eq(2).text( players );
            $td.eq(3).text( lob.high );
            $td.eq(4).text( round + ', ' + players );
            $td.eq(5).text( status );
        }

        // remove any games that no longer exist
        $('.lobbywin tr[hit=0]').remove();

        if( d.lobby.length == 0 )
            $('.norooms').show();
        else
            $('.norooms').hide();

        return;
    }

    if( $('.lobbywin').is(':visible') )
        $('.lobbywin, .shade').hide();

    var statechange = (!game || d.game.state != game.state);
    game = d.game;

    if( statechange )
    {
        $('.username').text(d.username);
        $('.scoresheet p span').text(game.name);
        var hovtext = 'Round: ' + game.round
                    + '\nMax rounds: ' + game.maxrounds
                    + '\nGoal score: ' + game.goal
                    + '\nRound time: ' + game.roundsecs
                    + '\nAbandon time: ' + game.abandonsecs
                    + '\nPassword: ' + game.pass;
        $('.scoresheet p').attr('title', hovtext);
    }

    if( clock - 1 != game.secs )
        $clock.text(clock = game.secs);

    var black = d.game.black;

    if( blackid != black.cardid || blacktxt != black.txt )
    {
        blackid = black.cardid;
        blacktxt = black.txt;
        blackhtml = black.txt.replace(
            /_({([^}]+)})?/g,
            '<span class=blank flags="$2">________</span>'
        );

        var $black = $('.blackcard');
        $black.attr('blackid',blackid);
        $black.find('.cardtxt').html(blackhtml);
        $black.find('.num div').text(black.num);
    }

    var oldhandcount = handcount;
    handcount = 0;
    for( h in d.hand )
        if( d.hand[h] && d.hand[h].cardid )
            handcount++;

    if( handcount < 10 )
        $('.draw').removeAttr('disabled');
    else
        $('.draw').attr('disabled',true);

    if( true ) // check for timestamp or something
    {
        var html = "";
        amczar = false;

        for( var i in d.players )
        {
            var pl = d.players[i];
            var myself = (pl.playerid == d.selfid);

            if( pl.idle > 1 && pl.gone && pl.score < 1 )
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
            }

            var stat = (pl.gone ? 'Out' : pl.idle ? 'Idle' : '');
            var whatup = (plczar ? 'Czar' : pl.whatup);
            var title = (pl.idle ? 'title="Idle '+pl.idle+' turns"' : '');
            html += '<tr class="' + classes + '" ' + title + '><td>' + pl.name
                 +  '</td><td>' + stat
                 +  '</td><td>' + pl.score
                 +  '</td><td>' + whatup
                 +  '</td></tr>';
        }

        if( statechange || game.state != 'champ' )
            $('.scoresheet tbody').html(html);

        if( amczar )
        {
            $('.callit').removeAttr('disabled');
            $('.play').addClass('czarbg');
        }
        else
        {
            $('.callit').attr('disabled',true);
            $('.play').removeClass('czarbg');
        }
    }

    if( statechange ) switch( game.state )
    {
        case 'gather':
            $('.win, .shade').hide();
            $('.draggable').draggable('enable');
            break;

        case 'champ':
            $('.champwin h1').text(d.champ);
            $('.win').hide();
            $('.champwin, .shade').show();
            break;

        default:
            $('.selectwin, .shade').show();
            $('.abandon').css('display','none').removeAttr('disabled').text('Abandon');
            $('.confirm').css('display','none').attr('disabled',true);
            $('.draggable').draggable('disable');
            $('.wintitle').text( amczar ? 'You are the Czar. Choose your favorite:' : 'Waiting for Czar '+czar+' to choose...' );
    }

    if( game.state == 'select' && amczar )
        $('.confirm').css('display','block');

    if( game.state == 'select' && clock > 30 && !amczar )
    {
        $('.abandon').css('display','block');

        if( d.abandonratio )
            $('.abandon').text(d.abandonratio);
    }

    for( var i = 0; i < 13; i++ )
    {
        var card = d.hand[i];
        var $card = $('.hasslot[slot=' + i + '] .card');

        if( card ) {
            if( card.cardid != $card.attr('cardid') ) {
                var r = 0, g = 0, b = 0;
                var seed = card.cardid;

                while( r*0.2126 + g*0.7152 + b*0.0722 < 150 ) {
                    r = Math.abs(Math.floor(Math.sin(seed+=10000) * 10000)) % 256;
                    g = Math.abs(Math.floor(Math.sin(seed+=10000) * 10000)) % 256;
                    b = Math.abs(Math.floor(Math.sin(seed+=10000) * 10000)) % 256;
                }

                var color = ' style="background-color: rgb('+r+','+g+','+b+')"';
                var $elem = $(
                    '<div class="card draggable" cardid=' + card.cardid + color + '>'
                    +   '<div class=cardtxt>' + pretty_white(card.txt) + '</div>'
                    + '</div>'
                );

                $card.replaceWith($elem);
                dragme($elem);
            }
        } else {
            $card.replaceWith("<div class='card slot slotnew'></div>");
            dropme( $('.slotnew').removeClass('slotnew') );
        }
    }

    if( game.state != 'gather' )
    {
        var ttlcons = 0;
        var repop = false;
        var $cons = $('.contenders');

        for( var i in d.game.consider )
        {
            for( var j in d.game.consider[i].cards )
            {
                ttlcons++;
                if( $cons.find('[cardid='+d.game.consider[i].cards[j].cardid+']').length < 1 )
                    repop = true;
            }
        }

        if( ttlcons != $cons.find('.card').length )
            repop = true;

        if( repop ) {
            $cons.html('');
            for( var i in d.game.consider ) {
                $cont = $('<div class=aset></div>');
                $cont.attr('idx', i);

                if( !d.game.consider[i].visible )
                    $cont.addClass('mystery');

                for( var j in d.game.consider[i].cards ) {
                    var card = d.game.consider[i].cards[j];
                    $elem = $(
                        "<div class=card>" +
                        " <div class=cardtxt></div>" +
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
                $('.selectwin .blackcard .cardtxt').html(blackhtml);
            });
        } else { // no repop
            for( var i in d.game.consider ) {
                if( d.game.consider[i].visible )
                    $('.aset[idx=' + i + ']').removeClass('mystery');
            }
        }

        if( typeof game.favorite == 'number' ) {
            $('.aset').removeClass('potential');
            $('.aset[idx='+game.favorite+']').addClass('favorite');
            $('.wintitle').text('A favorite is ' + game.favname + '!');
        } else if( game.state == 'bask' ) {
            $('.wintitle').text('No winner. Round abandoned.');
        }
    }
});

function err(s) {
    $('.err span').html(s);
    $('.err').show()
        .css({'background-color':'yellow','color':'black'})
        .animate({'background-color':'red','color':'white'});
}

function black_insert($aset) {
    var $bct = $('.selectwin .blackcard .cardtxt');
    var $wcts = $aset.find('.card');
    var i = 0;
    $bct.find('.blank').each(function() {
        var raw = $wcts.eq(i).attr('raw');
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
        if( i+1 < $wcts.length )
            i++;
    });
}

function pretty_white(txt) {
    txt = txt.charAt(0).toUpperCase() + txt.slice(1);
    if( txt.match(/[0-9a-zA-Z]$/) )
        txt += '.';
    return txt;
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
        if( i == 0 || i == list.length - 1 || lowwords.indexOf(word.toLowerCase()) == -1 )
            txt += word.charAt(0).toUpperCase() + word.slice(1) + " ";
        else
            txt += word + " ";
    }

    return txt.trim();
}

$(function() {
    dropme( $(".slot") );
    dragme( $(".draggable") );
    checkin();
    $clock = $('.clock');
    setInterval( function(){ $clock.text(++clock) }, 1002 );

    if( 'ontouchstart' in document )
      $('button.scale').show();

    $('.reset'  ).click( function(){ checkin({action:'reset'  }); } );
    $('.callit' ).click( function(){ checkin({action:'callit' }); quickly = true; } );
    $('.draw'   ).click( function(){ checkin({action:'draw'   }); quickly = true; $('.draw').attr('disabled',true); } );
    $('.abandon').click( function(){ checkin({action:'abandon'}); $('.abandon').attr('disabled',true); } );
    $('.confirm').click( function(){ checkin({action:'choose', idx:chosen}); quickly = true; $('.confirm').attr('disabled',true); } );

    $('.leave'  ).click(function() {
        var msg = 'Exit this room?';

        if( myscore == 1 )
            msg += ' You will lose your point!';
        else if( myscore > 1 )
            msg += ' You will lose your points!';

        if( game.state == 'champ' || confirm(msg) ) {
            checkin({action:'leave'  });
            quickly = true;
        }
    });

    var scale = 'thin';

    $('.scale').click(function() {
        var wide = "width=1175, user-scalable=no, maximum-scale=1, minimum-scale=1"
        var thin = "width=720, user-scalable=yes"
        var content;

        if( scale == 'wide' ) { scale = 'thin'; content = thin; }
        else                  { scale = 'wide'; content = wide; }

        $('head meta[name=viewport]').attr('content', content);
    });

    $('.create').click(function() {
        var n = $('input#name');
        var p = $('input#pass');
        var goal = $('input#goal');
        var maxrounds = $('input#maxrounds');
        var roundsecs = $('input#roundsecs');
        var abandonsecs = $('input#abandonsecs');
        var slowstart = $('input#slowstart');

        if( n.val() ) {
            checkin({
                action:'create',
                game:{
                    name:n.val(),
                    pass:p.val(),
                    goal:goal.val(),
                    maxrounds:maxrounds.val(),
                    roundsecs:roundsecs.val(),
                    abandonsecs:abandonsecs.val(),
                    slowstart:slowstart.val()
                }
            });
            quickly = true;
            n.val('');
            p.val('');
            $('.jointab').click();
        }
    });

    $('.help').click( function() {
        var newwin = window.open("./help.html", 'Help', 'height=600,width=500,location=0,menubar=0,status=0,toolbar=0,scrollbars=1,resizable=1,top=200,left=400');
        if( window.focus ) { newwin.focus(); }
        return false;
    });

    $(document).on('click', '.lobbywin table button', function() {
        checkin({
            action: 'join',
            gameid: $(this).closest('tr').attr('gameid'),
            pass: $(this).closest('tr').find('input').val()
        });
    } );

    $('.jointab').click( function() {
        $('.lobbywin li').removeClass('selected');
        $(this).addClass('selected');
        $('.createpage').hide();
        $('.joinpage').show();
    } );

    $('.createtab').click( function() {
        $('.lobbywin li').removeClass('selected');
        $(this).addClass('selected');
        $('.joinpage').hide();
        $('.createpage').show();
    } );

    $(document).on('mousemove click keydown', function() { movement++; });

    $('.err button').click( function(){ $('.err').slideUp(); });
});

// vim: ts=4 sw=4 et
