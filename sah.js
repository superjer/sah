var $xhr = null;
var to = null;
var clock = 0;
var $clock = null;
var game = null;
var quickly = false;
var playersmd5 = '0';
var handcount = -1;
var amczar = false;
var czar = 'No one';
var movement = 0;
var chosen = 0;
var blackid = 0;
var blacktxt = '';

function dropme($x) {
  $x.droppable({
    tolerance: "intersect",
    drop: function( event, ui ){
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

function dragme($x) {
  $x.draggable({
    cancel: ".thermo",
    revert: "invalid",
    stack: ".draggable",
  })
  .disableSelection();
}

function checkin( json ) {
  if( $xhr ) { $xhr.abort(); $xhr = null; }
  clearTimeout(to);

  if( typeof json == 'undefined' ) json = {};
  json.movement = movement;
  movement = 0;
  json = JSON.stringify(json);

  $xhr = $.post("ajax.php", json, function(data){
    d = $.parseJSON(data);
    if( d.msg ) { err( d.msg ); return; }

    if( d.inlobby )
    {
      $('.selectwin').hide();
      $('.lobbywin, .shade').show();
      $('.lobbywin tr').attr('hit', 0);
      $('.lobbywin tr').eq(0).attr('hit', 1);

      var html = '';
      for( var l in d.lobby )
      {
        var lob = d.lobby[l];
        var trsel = '.lobbywin tr[gameid=' + lob.id + ']';

        if( $(trsel).length == 0 )
          $('.lobbywin table tbody').append( $(
            "<tr gameid=" + lob.id + ">"
            + "<td></td><td></td><td></td><td></td>"
            + "<td>" + (lob.pass ? "<input type=text value='' placeholder=password>" : "") + "</td>"
            + "<td><button gameid=" + lob.id + ">Join</button></td>"
            + "</tr>"
          ) );

        $(trsel).attr('hit', 1);
        var $td = $(trsel).find('td');
        $td.eq(0).html( lob.name + (lob.pass ? ' <span class=key>⚷</span>' : '') );
        $td.eq(1).text( lob.players );
        $td.eq(2).text( lob.high );
        $td.eq(3).text( lob.secs > 240 ? 'crickets' : 'active' );
      }

      // remove any games that no longer exist
      $('.lobbywin tr[hit=0]').remove();

      to = setTimeout( checkin, 3000 );
      return;
    }

    if( $('.lobbywin').is(':visible') )
      $('.lobbywin, .shade').hide();

    var statechange = (!game || d.game.state != game.state);
    game = d.game;

    $('.username').text(d.username);
    $('.scoresheet p span').text(game.name);

    if( clock - 1 != game.secs )
      $clock.text(clock = game.secs);

    if( blackid != d.black.id || blackclass != d.black.class || blackheight != d.black.height )
    {
      blackid = d.black.id;
      blacktxt = d.black.txt;
      blackclass = d.black.class;
      blackheight = d.black.height;

      var $black = $('.blackcard');
      $black.attr('blackid',blackid);
      $black.find('.cardtxt').html(blacktxt);
      $black.find('.num div').text(d.black.nr);
      $black.find('.thermo').removeClass('love hate').addClass(blackclass);
      $black.find('.thermo div').css('height',blackheight);
    }

    if( d.handcount != handcount ){
      handcount = d.handcount;
      if( handcount < 10 )
        $('.draw').removeAttr('disabled');
      else
        $('.draw').attr('disabled',true);
    }

    if( d.playersmd5 != playersmd5 ){
      playersmd5 = d.playersmd5;
      var html = "";
      amczar = false;
      for( var i in d.players ) {
        var pl = d.players[i];
        if( pl.idle > 1 && pl.gone && pl.score < 1 )
          continue;
        var classes = "";
        if(pl.czar && pl.myself)
          amczar = true;
        if( pl.czar ) { czar = pl.name; classes += " czar"; }
        if( pl.myself ) classes += " myself";
        var stat = (pl.gone ? 'Out' : pl.idle ? 'Idle' : '');
        var whatup = (pl.czar ? 'Czar' : pl.whatup);
        var title = (pl.idle ? 'title="Idle '+pl.idle+' turns"' : '');
        html += '<tr class="'+classes+'" '+title+'><td>' + pl.name
             +  '</td><td>' + stat
             +  '</td><td>' + pl.score
             +  '</td><td>' + whatup
             +  '</td></tr>';
      }
      $('.scoresheet tbody').html(html);
      if( amczar )
        $('.callit').removeAttr('disabled');
      else
        $('.callit').attr('disabled',true);
    }

    if( statechange ){
      if( game.state == 'gather' ){
        $('.selectwin, .shade').hide();
        $('.draggable').draggable('enable');
      }else{
        $('.selectwin, .shade').show();
        $('.abandon').css('display','none').removeAttr('disabled').text('Abandon');
        $('.confirm').css('display','none').attr('disabled',true);
        $('.draggable').draggable('disable');
        $('.wintitle').text( amczar ? 'You are the Czar. Choose the winner:' : 'Waiting for Czar '+czar+' to choose...' );
      }
    }

    if( game.state == 'select' && amczar ){
      $('.confirm').css('display','block');
    }

    if( game.state == 'select' && clock > 30 && !amczar ){
      $('.abandon').css('display','block');
      if( d.abandonratio )
        $('.abandon').text(d.abandonratio);
    }

    var $mycards = $('.card.draggable');
    var newlist = [];
    for( var i in d.hand ){
      var card = d.hand[i];
      var $it = $mycards.filter('[whiteid='+card.whiteid+']');
      if( $it.length > 0 ) {
        $mycards = $mycards.not($it);
        $it.find('.bar').css('height', card.thermoheight+'px');
        $it.find('.thermo').removeClass('love hate').addClass(card.thermoclass);
      } else {
        var start = (card.inplay ? 'startinplay=1' : '');
        var $elem = $(
            '<div class="card draggable" whiteid='+card.whiteid+' '+start+'>'
          +   '<div class="cardtxt">'+card.txt+'</div>'
          +   '<div class="thermo '+card.thermoclass+'">'
          +     '<div class=bar style="height:'+card.thermoheight+'px;"></div>'
          +   '</div>'
          + '</div>'
        );
        newlist.push( $elem );
      }
    }
    if( $mycards.length > 0 ){
      $mycards.replaceWith("<div class='card slot slotnew'></div>");
      dropme( $('.slotnew').removeClass('slotnew') );
    }
    var $handslots = $('.hand .slot');
    var $playslots = $('.play .slot');
    for( var i in newlist ){
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

    if( game.state != 'gather' ){
      var ttlcons = 0;
      var repop = false;
      var $cons = $('.contenders');
      for( i in d.consider ){
        for( j in d.consider[i].cards ){
          ttlcons++;
          if( $cons.find('[whiteid='+d.consider[i].cards[j].whiteid+']').length < 1 )
            repop = true;
        }
      }
      if( ttlcons != $cons.find('.card').length )
        repop = true;
      if( repop ){
        $cons.html('');
        for( i in d.consider ){
          $cont = $('<div class="aset" playerid='+d.consider[i].playerid+'></div>');
          $cont.attr('repltxt',d.consider[i].repltxt);
          for( j in d.consider[i].cards ){
            var card = d.consider[i].cards[j];
            $elem = $(
              "<div class=card>" +
              " <div class=cardtxt></div>" +
              " <div class=thermo><div class=bar></div></div>" +
              "<div>"
            );
            $elem.attr('whiteid',card.whiteid);
            $elem.find('.cardtxt').text(card.txt);
            $elem.find('.thermo').addClass(card.thermoclass);
            $elem.find('.bar').css('height',card.thermoheight);
            $cont.append($elem);
            if( card.state=='hidden' )
              $cont.addClass('mystery');
          }
          $cons.append($cont);
        }
        $('.aset').click(function(event){
          var $targ = $(event.target);
          if( $targ.hasClass('thermo') || $targ.parents('.thermo').length > 0 )
            return;
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
        $('.selectwin .blackcard').click(function(event){
          chosen = 0;
          $('.aset').removeClass('potential');
          $('.selectwin .blackcard .cardtxt').html(blacktxt);
        });
      }else{ // no repop
        for( i in d.consider ){
          for( j in d.consider[i].cards ){
            var playerid = d.consider[i].playerid;
            var card = d.consider[i].cards[j];
            var $thermo = $('.aset .card[whiteid='+card.whiteid+'] .thermo');
            $thermo.removeClass('love hate').addClass(card.thermoclass);
            $thermo.find('.bar').css('height',card.thermoheight);
            if( card.state=='consider' )
              $('.aset[playerid='+playerid+']').removeClass('mystery');
          }
        }
      }

      if( game.winner > 0 ){
        $('.aset').removeClass('potential');
        $('.aset[playerid='+game.winner+']').addClass('winner');
        $('.wintitle').text('A winner is '+game.winnername+'!');
      }else if( game.state == 'bask' ){
        $('.wintitle').text('No winner. Round abandoned. Cards returned to hands.');
      }
    }

    var ms = quickly ? 10 : 2500;
    quickly = false;
    to = setTimeout( checkin, ms );
  });
}

function err(s) {
  $('.err span').html(s);
  $('.err').show();
}

function upclock() {
  $clock.text( ++clock );
}

$(function() {
  dropme( $(".slot") );
  dragme( $(".draggable") );
  checkin();
  $clock = $('.clock');
  setInterval( upclock, 1002 );

  $('.reset'  ).click( function(){ checkin({action:'reset'  }); } );
  $('.callit' ).click( function(){ checkin({action:'callit' }); quickly = true; } );
  $('.draw'   ).click( function(){ checkin({action:'draw'   }); quickly = true; $('.draw').attr('disabled',true); } );
  $('.abandon').click( function(){ checkin({action:'abandon'}); $('.abandon').attr('disabled',true); } );
  $('.confirm').click( function(){ checkin({action:'choose', playerid:chosen}); quickly = true; $('.confirm').attr('disabled',true); } );
  $('.leave'  ).click( function(){ checkin({action:'leave'  }); quickly = true; } );

  $('.create' ).click(function(){
    var n = $('input#name');
    var p = $('input#pass');
    var goal = $('input#goal');
    var roundsecs = $('input#roundsecs');
    var abandonsecs = $('input#abandonsecs');
    if( n.val() )
    {
      checkin({action:'create', name:n.val(), pass:p.val(), goal:goal.val(), roundsecs:roundsecs.val(), abandonsecs:abandonsecs.val()});
      quickly = true;
      n.val('');
      p.val('');
      $('.jointab').click();
    }
  });

  $(document).on('click', '.lobbywin table button', function(){
    checkin({
      action: 'join',
      gameid: $(this).closest('tr').attr('gameid'),
      pass: $(this).closest('tr').find('input').val()
    });
    quickly = true;
  } );

  $('.jointab').click( function(){
    $('.lobbywin li').removeClass('selected');
    $(this).addClass('selected');
    $('.createpage').hide();
    $('.joinpage').show();
  } );

  $('.createtab').click( function(){
    $('.lobbywin li').removeClass('selected');
    $(this).addClass('selected');
    $('.joinpage').hide();
    $('.createpage').show();
  } );

  $(document).on('mousemove click keydown', function() { movement++; });

  $('.err button').click( function(){ $('.err').slideUp(); });

  $(document).on('click', '.thermo', function(event){
    var $this = $(this);
    var $votebutts = $this.find('button');
    if( $votebutts.length > 0 ) {
      $votebutts.remove();
      return;
    }
    $votebutts = $('<button class=voteup>+</button><button class=votedown>-</button>');
    $this.prepend( $votebutts );
    var color = $this.parents('.blackcard').length > 0 ? 'black' : 'white';
    var $parentcard = $this.parents('.card');
    var id = $parentcard.attr(color+'id');
    $parentcard.off('mouseleave').on('mouseleave', function() {
      $(this).find('button').remove();
    });
    $votebutts.on( 'click', function(event){
      var $this = $(this);
      var yeanay = $this.hasClass('voteup') ? 'yea' : 'nay';
      checkin({action:'vote', color:color, id:id, yeanay:yeanay});
      $this.parent().find('button').remove();
      event.stopPropagation();
    });
    event.stopPropagation();
  });
});
