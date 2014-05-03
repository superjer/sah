<?

ini_set('display_errors',true);
error_reporting(E_ALL&~E_NOTICE);
include "../inc/config.inc";

mysql_select_db(trim(file_get_contents('dbname')));

$blackid = intval($_SERVER['QUERY_STRING']);

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
  $blacktxt = preg_replace( '/_/', "<b>$whitetxt</b>", $blacktxt, 1 );
}

$blacktxt = str_replace( '_', "<b>$whitetxt</b>", $blacktxt );

echo $blacktxt;
