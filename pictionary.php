<?

ini_set('display_errors',true);
error_reporting(E_ALL&~E_NOTICE);
include "../inc/config.inc";

mysql_select_db(trim(file_get_contents('dbname')));

$qr = mysql_query("SELECT * FROM card WHERE color='white' ORDER BY RAND() LIMIT 1");
while( $r = mysql_fetch_assoc($qr) )
{
  echo $r['txt'];
}

?>
<br><br>
<a style='font-size:300%;' href="./pictionary.php?">NAXT!</a>
