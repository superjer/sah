<?

ini_set('display_errors',true);
error_reporting(E_ALL&~E_NOTICE);
include "../inc/config.inc";

mysql_select_db(trim(file_get_contents('dbname')));

$blackid = intval($_SERVER['QUERY_STRING']);

if( !strlen($_SERVER['QUERY_STRING']) )
{
  $qr = mysql_query("SELECT COUNT(*) FROM black");
  $r = mysql_fetch_row($qr);
  $blackid = mt_rand(0, $r[0]);
}

if( $blackid )
{
  $qr = mysql_query("SELECT * FROM black WHERE id=$blackid");
  $r = mysql_fetch_assoc($qr);
  $blacktxt = $r['txt'];
  $number = $r['number'];
}
else
{
  $blacktxt = urldecode( $_SERVER['QUERY_STRING'] );
  $blacktxt = preg_replace( '/_+/', '_', $blacktxt );
  $number = substr_count( $blacktxt, '_' );
}

$qr = mysql_query("SELECT * FROM white ORDER BY RAND() LIMIT $number");
while( $r = mysql_fetch_assoc($qr) )
{
  $whitetxt = $r['txt'];
  $fulltxt = preg_replace( '/_/', "<b>$whitetxt</b>", $blacktxt, 1 );
}

$fulltxt = str_replace( '_', "<b>$whitetxt</b>", $fulltxt );

echo $fulltxt;

?>
<br><br><br>
<form>
<label>Text or black ID: <br><textarea rows=4 cols=80 style='font-size:18px;'><?= $blacktxt ?></textarea></label><br>
<input type=submit value=Go>
</form>
<br><br>
<a href="./test10.php?">Try it with 10 cards!</a>
<script src="//ajax.googleapis.com/ajax/libs/jquery/1.9.1/jquery.min.js"></script>
<script>
$(function(){
  $('form').submit(function(){
    window.location.href = "?" + $('textarea').val();
    return false;
  });
});
</script>
