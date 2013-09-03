var $xhr = null;
var to = null;
var $clock = null;
var game = null;

function dropme($x) {
  $x.droppable({
    tolerance: "intersect",
    drop: function( event, ui ){
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
    cursor: "move",
    cancel: ".thermo",
    revert: "invalid",
    stack: ".draggable",
  })
  .disableSelection();
}
function checkin( json ) {
  if( $xhr ) { $xhr.abort(); xhr = null; }
  clearTimeout(to);

  if( typeof json == 'undefined' ) json = {};
  json = JSON.stringify(json);

  $xhr = $.post("ajax.php", json, function(data){
    d = $.parseJSON(data);
    if( d.msg ) alert( d.msg );

    var statechange = (!game || d.game.state != game.state);
    game = d.game;

    if( $clock.text() - 1 != game.secs )
      $clock.text(game.secs);

    if( statechange ){
      if( game.state == 'gather' ){
        $('.selectwin, .shade').hide();
        $('.draggable').draggable('enable');
      }else{
        $('.selectwin, .shade').show();
        $('.draggable').draggable('disable');
        $('.wintitle').text('Choose winner...');
      }
    }

    var $black = $('.blackcard');
    $black.find('.cardtxt').text(d.black.txt);
    $black.find('.num div').text(d.black.nr);
    $black.find('.thermo').removeClass('love').removeClass('hate').addClass(d.black.class);
    $black.find('.thermo div').css('height',d.black.height);

    var $tbody = $('.scoresheet tbody');
    var html = "";
    for( var i in d.players ) {
      var pl = d.players[i];
      html += '<tr><td>'+pl.name+'</td><td>'+pl.score+'</td><td>'+pl.whatup+'</td><td>'+pl.idle+'</td><td>'+pl.czar+'</td></tr>';
    }
    $tbody.html(html);

    var $mycards = $('.card.draggable');
    var newlist = [];
    for( var i in d.hand ){
      var card = d.hand[i];
      var $it = $mycards.filter('[whiteid='+card.whiteid+']');
      if( $it.length > 0 )
        $mycards = $mycards.not($it);
      else {
        var start = (card.inplay ? 'startinplay=1' : '');
        var $elem = $(
            '<div class="card draggable" whiteid='+card.whiteid+' '+start+'>'
          +   '<div class=cardtxt></div>'
          +   '<div class="thermo '+card.thermoclass+'">'
          +     '<div style="height:'+card.thermoheight+'px;"></div>'
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
          var playerid = $(this).attr('playerid');
          checkin( {action:'choose', playerid:playerid} );
        });
      }

      if( game.winner > 0 ){
        $('.aset[playerid='+game.winner+']').addClass('winner');
        $('.wintitle').text('A winner is '+game.winnername+'!');
      }
    }

    to = setTimeout( checkin, 2500 );
  });
}
function err(s) {
  $('.err').text('Error: '+s).css('display','block');
}
function upclock() {
  $clock.text( parseInt($clock.text()) + 1 );
}
$(function() {
  dropme( $(".slot") );
  dragme( $(".draggable") );
  checkin();
  $clock = $('.clock span');
  setInterval( upclock, 1002 );
  $('.reset').click( function(){ checkin({action:'reset'}); } );
  $('.callit').click( function(){ checkin({action:'callit'}); } );
  $('html').disableSelection();
});
