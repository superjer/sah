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
  .disableSelection()
  .off('mouseleave')
  .on('mouseleave', function() {
    $(this).find('.voteup, .votedown').hide();
  });
}

function checkin( json ) {
  if( $xhr ) { $xhr.abort(); xhr = null; }
  clearTimeout(to);

  if( typeof json == 'undefined' ) json = {};
  json.movement = movement;
  movement = 0;
  json = JSON.stringify(json);

  $xhr = $.post("ajax.php", json, function(data){
    d = $.parseJSON(data);
    if( d.msg ) { err( d.msg ); return; }

    var statechange = (!game || d.game.state != game.state);
    game = d.game;

    $('.username').text(d.username);

    if( clock - 1 != game.secs )
      $clock.text(clock = game.secs);

    var $black = $('.blackcard');
    $black.attr('blackid',d.black.id);
    $black.find('.cardtxt').text(d.black.txt);
    $black.find('.num div').text(d.black.nr);
    $black.find('.thermo').removeClass('love hate').addClass(d.black.class);
    $black.find('.thermo div').css('height',d.black.height);

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
        $('.abandon').css('visibility','hidden').removeAttr('disabled').text('Abandon');
        $('.draggable').draggable('disable');
        $('.wintitle').text( amczar ? 'You are the Czar. Choose the winner:' : 'Waiting for '+czar+' to choose...' );
      }
    }

    if( game.state == 'select' && clock > 30 && !amczar ){
      $('.abandon').css('visibility','visible');
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
          +   '<div class=cardtxt></div>'
          +   '<div class="thermo '+card.thermoclass+'">'
          +     '<div class=bar style="height:'+card.thermoheight+'px;"></div>'
          +   '</div>'
          + '</div>'
        );
        $elem.find('.cardtxt').text(card.txt/*+' '+card.whiteid*/);
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
          $cont = $( "<div class=aset playerid="+d.consider[i].playerid+"></div>" );
          for( j in d.consider[i].cards ){
            var card = d.consider[i].cards[j];
            $elem = $( "<div class=card><div class=cardtxt></div><div>" );
            $elem.attr('whiteid',card.whiteid);
            $elem.find('.cardtxt').text(card.txt);
            $cont.append($elem);
          }
          $cons.append($cont);
        }
        $('.aset').click(function(event){
          if( !amczar ) return;
          var playerid = $(this).attr('playerid');
          checkin( {action:'choose', playerid:playerid} );
          quickly = true;
        });
      }

      if( game.winner > 0 ){
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
  $('.err').text(s).css('display','block');
}

function upclock() {
  $clock.text( ++clock );
}

$(document).on('mousemove click keydown', function() { movement++; });

$(function() {
  dropme( $(".slot") );
  dragme( $(".draggable") );
  checkin();
  $clock = $('.clock');
  setInterval( upclock, 1002 );
  $('html').disableSelection();

  $('.reset'  ).click( function(){ checkin({action:'reset'  }); } );
  $('.callit' ).click( function(){ checkin({action:'callit' }); quickly = true; } );
  $('.draw'   ).click( function(){ checkin({action:'draw'   }); quickly = true; $('.draw').attr('disabled',true); } );
  $('.abandon').click( function(){ checkin({action:'abandon'}); $('.abandon').attr('disabled',true); } );

  $(document).on('click', '.thermo', function(event){
    var $this = $(this);
    var $buttons = $this.find('button:visible');
    if( $buttons.length > 0 ) {
      $buttons.hide();
      return;
    }
    $this.prepend( $('.votedown').show().remove() );
    $this.prepend( $('.voteup').show().remove() );
    var color = $this.parents('.blackcard').length > 0 ? 'black' : 'white';
    var id = $this.parents('.card').attr(color+'id');
    $('.voteup, .votedown').off('click').on( 'click', function(){
      var $this = $(this);
      var yeanay = $this.hasClass('voteup') ? 'yea' : 'nay';
      checkin({action:'vote', color:color, id:id, yeanay:yeanay});
    });
  });
});
