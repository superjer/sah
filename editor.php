<?

ini_set('display_errors',true);
error_reporting(E_ALL&~E_NOTICE);
include "../inc/config.inc";

mysql_select_db(trim(file_get_contents('dbname')));

$qr = mysql_query("SELECT * FROM card");

$view = array();

while( $r = mysql_fetch_assoc($qr) )
{
  if( $r['color'] == 'white' )
  {
    $r['textcolor'] = 'black';
    $r['number'] = '';
  }
  else
  {
    $r['textcolor'] = 'white';
  }

  $view['rows'][] = $r;
}

usort( $view['rows'], sortfunc );

function sortfunc($a, $b)
{
  $find = array("/(^a |^an |^the |[^a-z0-9]+)/");
  $repl = "";
  $a = trim(preg_replace($find, $repl, strtolower($a['txt'])));
  $b = trim(preg_replace($find, $repl, strtolower($b['txt'])));
  return $a > $b;
}

include "editor-view.php";
