<!DOCTYPE html>
<html>
<head>
<title>SAH Test 10</title>
<meta name=viewport content="initial-scale=1.0, width=device-width, user-scalable=yes">
<style>
input[type=submit], input[type=button] {width:100px; font-size:22px;}
</style>
</head>
<body>
<?

ini_set('display_errors',true);
error_reporting(E_ALL&~E_NOTICE);
include "../inc/config.inc";

mysql_select_db(trim(file_get_contents('dbname')));

$blackid = intval($_SERVER['QUERY_STRING']);

if( !strlen($_SERVER['QUERY_STRING']) )
{
  $qr = mysql_query("SELECT COUNT(*) FROM card WHERE color='black'");
  $r = mysql_fetch_row($qr);
  $rand = mt_rand(0, $r[0]);
  $qr = mysql_query("SELECT id FROM card WHERE color='black' LIMIT $rand,1");
  $r = mysql_fetch_row($qr);
  $blackid = $r[0];
}

if( $blackid )
{
  $qr = mysql_query("SELECT * FROM card WHERE id=$blackid");
  $r = mysql_fetch_assoc($qr);
  $blacktxt = $r['txt'];
  $number = $r['number'];
}
else if( $_SERVER['QUERY_STRING'] )
{
  $blacktxt = urldecode( $_SERVER['QUERY_STRING'] );
  $blacktxt = preg_replace( '/_+/', '_', $blacktxt );
  $number = substr_count( $blacktxt, '_' );
}

echo "<style>.slot {color:red;}</style>";

echo "<div id=black>";
echo str_replace( '_', '<span class=slot>_</span>', $blacktxt );
echo "</div><hr>";

$qr = mysql_query("SELECT * FROM card WHERE color='white' ORDER BY RAND() LIMIT 10");
while( $r = mysql_fetch_assoc($qr) )
{
  $whitetxt = $r['txt'];
  $whiteid = $r['id'];
  echo "<div><label><input type=checkbox clicknr=0>$whitetxt</input></label></div>";
}

?>
<br>
<form>
<label>Text or black ID: <br><textarea
  style='font-size:18px; width:100%; max-width: 800px;'
><?= $blacktxt ?></textarea></label><br>
<input type=submit value=Go>
<input type=submit name=select value=Select>
<input type=submit name=rando value=Rando>
</form>
<br><br>
<a href="./test.php?">Try it with fewer choices!</a>
<script src="//ajax.googleapis.com/ajax/libs/jquery/1.9.1/jquery.min.js"></script>
<script>
$(function(){
  var n = 0;

  $('input').change(function(){
    $(this).attr('clicknr',++n);
    $chk = $('input:checked');

    var vals = [];
    var i;

    for( i = 0; i < $chk.length; i++ )
      vals[ $chk.eq(i).attr('clicknr') ] = $chk.eq(i).parent().text();

    var $slots = $('.slot');
    var s = 0;

    $slots.text('_');

    for( i in vals )
      $slots.eq(s++).text(vals[i]);

    while( s < $slots.length )
      $slots.eq(s++).text(vals[i]);
  });

  $('input[name=rando]').click(function(){
    $('textarea').val('');
  });

  $('input[name=select]').click(function(e){
    $('textarea').select();
    e.preventDefault();
    return false;
  });

  $('form').submit(function(){
    window.location.href = "?" + $('textarea').val();
    return false;
  });
});
</script>
</body>
</html>
