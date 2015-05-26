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
                whiteid: $card.attr('whiteid'),
                inplay:  ($card.parents('.play').length > 0),
                slot:    $card.parent().attr('slot'),
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
}

socket.on('state', function(d){

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

        // to = setTimeout( checkin, 9000 );
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
        blacktxt = black.txt.replace(/_/g, '<span class=blank>________</span>');

        var $black = $('.blackcard');
        $black.attr('blackid',blackid);
        $black.find('.cardtxt').html(blacktxt);
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

            if( myself ) {
                myscore = pl.score;
                classes += " myself";
                if( pl.czar )
                    amczar = true;
            }

            if( pl.czar ) {
                czar = pl.name;
                classes += " czar";
            }

            var stat = (pl.gone ? 'Out' : pl.idle ? 'Idle' : '');
            var whatup = (pl.czar ? 'Czar' : pl.whatup);
            var title = (pl.idle ? 'title="Idle '+pl.idle+' turns"' : '');
            html += '<tr class="'+classes+'" '+title+'><td>' + pl.name
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
            $('.wintitle').text( amczar ? 'You are the Czar. Choose the winner:' : 'Waiting for Czar '+czar+' to choose...' );
    }

    if( game.state == 'select' && amczar )
        $('.confirm').css('display','block');

    if( game.state == 'select' && clock > 30 && !amczar )
    {
        $('.abandon').css('display','block');

        if( d.abandonratio )
            $('.abandon').text(d.abandonratio);
    }

    var $mycards = $('.card.draggable');
    var newlist = [];

    for( var i in d.hand )
    {
        var card = d.hand[i];
        if( !card )
            continue;
        var $it = $mycards.filter('[whiteid='+card.cardid+']');

        if( $it.length > 0 )
        {
            $mycards = $mycards.not($it);
        }
        else
        {
            var start = (card.inplay ? 'startinplay=1' : '');
            var $elem = $(
                  '<div class="card draggable" whiteid='+card.cardid+' '+start+'>'
                +   '<div class="cardtxt">'+card.txt+'</div>'
                + '</div>'
            );
            newlist.push( $elem );
        }
    }

    if( $mycards.length > 0 )
    {
        $mycards.replaceWith("<div class='card slot slotnew'></div>");
        dropme( $('.slotnew').removeClass('slotnew') );
    }

    var $handslots = $('.hand .slot');
    var $playslots = $('.play .slot');

    for( var i in newlist )
    {
        var $elem = newlist[i];
        var $slots = $handslots;

        if( $elem.attr('startinplay') )
            $slots = $playslots;

        if( $slots.length < 1 ) { err("Nowhere to put new card!"); continue; }

        $aslot = $slots.first();
        $handslots = $handslots.not($aslot); // reference?
        $playslots = $playslots.not($aslot);
        $aslot.replaceWith($elem);
        dragme($elem);
    }

    if( game.state != 'gather' )
    {
        var ttlcons = 0;
        var repop = false;
        var $cons = $('.contenders');

        for( i in d.consider )
        {
            for( j in d.consider[i].cards )
            {
                ttlcons++;
                if( $cons.find('[whiteid='+d.consider[i].cards[j].whiteid+']').length < 1 )
                    repop = true;
            }
        }

        if( ttlcons != $cons.find('.card').length )
            repop = true;

        if( repop )
        {
            $cons.html('');
            for( i in d.consider )
            {
                $cont = $('<div class="aset" playerid='+d.consider[i].playerid+'></div>');
                $cont.attr('repltxt',d.consider[i].repltxt);

                for( j in d.consider[i].cards )
                {
                    var card = d.consider[i].cards[j];
                    $elem = $(
                        "<div class=card>" +
                        " <div class=cardtxt></div>" +
                        "<div>"
                    );
                    $elem.attr('whiteid',card.whiteid);
                    $elem.find('.cardtxt').text(card.txt);
                    $cont.append($elem);
                    if( card.state=='hidden' )
                        $cont.addClass('mystery');
                }

                $cons.append($cont);
            }

            $('.aset').click(function(event)
            {
                var $cards = $(this).find('.card');
                var $bct = $('.selectwin .blackcard .cardtxt');
                var playerid = $(this).attr('playerid');
                var $aset = $('.aset[playerid='+playerid+']');

                if( !amczar && $aset.hasClass('mystery') )
                    return;

                $('.aset').removeClass('potential');
                $aset.addClass('potential');
                $bct.html($(this).attr('repltxt'));

                if( !amczar ) return;

                $aset.removeClass('mystery');
                $('.confirm').removeAttr('disabled');
                checkin( {action:'reveal', playerid:playerid} );
                chosen = playerid;
                quickly = true;
            });

            $('.selectwin .blackcard').click(function(event)
            {
                chosen = 0;
                $('.aset').removeClass('potential');
                $('.selectwin .blackcard .cardtxt').html(blacktxt);
            });
        }
        else // no repop
        {
            for( i in d.consider )
            {
                for( j in d.consider[i].cards )
                {
                    var playerid = d.consider[i].playerid;
                    var card = d.consider[i].cards[j];

                    if( card.state=='consider' )
                        $('.aset[playerid='+playerid+']').removeClass('mystery');
                }
            }
        }

        if( game.winner > 0 )
        {
            $('.aset').removeClass('potential');
            $('.aset[playerid='+game.winner+']').addClass('winner');
            $('.wintitle').text('A winner is '+game.winnername+'!');
        }
        else if( game.state == 'bask' )
        {
            $('.wintitle').text('No winner. Round abandoned. Cards returned to hands.');
        }
    }

    var ms = quickly ? 10 : 9000;
    quickly = false;
    to = setTimeout( checkin, ms );
});

function err(s)
{
    $('.err span').html(s);
    $('.err').show()
        .css({'background-color':'yellow','color':'black'})
        .animate({'background-color':'red','color':'white'});
}

function upclock()
{
    $clock.text( ++clock );
}

$(function()
{
    dropme( $(".slot") );
    dragme( $(".draggable") );
    checkin();
    $clock = $('.clock');
    setInterval( upclock, 1002 );

    if( 'ontouchstart' in document )
      $('button.scale').show();

    $('.reset'  ).click( function(){ checkin({action:'reset'  }); } );
    $('.callit' ).click( function(){ checkin({action:'callit' }); quickly = true; } );
    $('.draw'   ).click( function(){ checkin({action:'draw'   }); quickly = true; $('.draw').attr('disabled',true); } );
    $('.abandon').click( function(){ checkin({action:'abandon'}); $('.abandon').attr('disabled',true); } );
    $('.confirm').click( function(){ checkin({action:'choose', playerid:chosen}); quickly = true; $('.confirm').attr('disabled',true); } );

    $('.leave'  ).click(function()
    {
        var msg = 'Exit this room?';

        if( myscore == 1 )
            msg += ' You will lose your point!';
        else if( myscore > 1 )
            msg += ' You will lose your points!';

        if( game.state == 'champ' || confirm(msg) )
        {
            checkin({action:'leave'  });
            quickly = true;
        }
    });

    var scale = 'thin';

    $('.scale').click(function()
    {
        var wide = "width=1175, user-scalable=no, maximum-scale=1, minimum-scale=1"
        var thin = "width=720, user-scalable=yes"
        var content;

        if( scale == 'wide' ) { scale = 'thin'; content = thin; }
        else                  { scale = 'wide'; content = wide; }

        $('head meta[name=viewport]').attr('content', content);
    });

    $('.create').click(function()
    {
        var n = $('input#name');
        var p = $('input#pass');
        var goal = $('input#goal');
        var maxrounds = $('input#maxrounds');
        var roundsecs = $('input#roundsecs');
        var abandonsecs = $('input#abandonsecs');
        var slowstart = $('input#slowstart');

        if( n.val() )
        {
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

    $('.help').click( function()
    {
        var newwin = window.open("./help.html", 'Help', 'height=600,width=500,location=0,menubar=0,status=0,toolbar=0,scrollbars=1,resizable=1,top=200,left=400');
        if( window.focus ) { newwin.focus(); }
        return false;
    });

    $(document).on('click', '.lobbywin table button', function()
    {
        checkin({
            action: 'join',
            gameid: $(this).closest('tr').attr('gameid'),
            pass: $(this).closest('tr').find('input').val()
        });
    } );

    $('.jointab').click( function()
    {
        $('.lobbywin li').removeClass('selected');
        $(this).addClass('selected');
        $('.createpage').hide();
        $('.joinpage').show();
    } );

    $('.createtab').click( function()
    {
        $('.lobbywin li').removeClass('selected');
        $(this).addClass('selected');
        $('.joinpage').hide();
        $('.createpage').show();
    } );

    $(document).on('mousemove click keydown', function() { movement++; });

    $('.err button').click( function(){ $('.err').slideUp(); });
});

// vim: ts=4 sw=4 et
