$(function(){
      var url = 'http://superjer.com:1337';

      var socket = io.connect(url);

      socket.on('reassure', function(data) {

              $('#output').append( $('<div>').text(data.output) );
      });

      $('form').on('submit', function(event) {

              event.preventDefault();
              socket.emit('cope', {input: $('input[type=text]').val()});
      });
});

// vim: sw=8 ts=8 et
