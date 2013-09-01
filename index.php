<?

ini_set('display_errors',true);
include "mustache.php";

error_reporting(E_ALL&~E_NOTICE);
include "../inc/config.inc";
error_reporting(E_ALL);

if( !isset($_SESSION['userid']) )
  die("You need to log in!");

$username = $_SESSION['selfname'];
$userid = intval( $_SESSION['userid'] );

$view = array();
$view['username'] = $username;
$view['score']    = 0;
$view['hand']     = array();

mysql_select_db('sah');

$qr = mysql_query("SELECT * FROM player WHERE user=$userid");
if( mysql_num_rows($qr) < 1 )
{
  $gameid = 1;
  mysql_query("INSERT INTO player SET gameid=$gameid, user=$userid");
  $playerid = mysql_insert_id();
}
else
{
  $r = mysql_fetch_assoc($qr);
  $playerid = $r['id'];
  $gameid = $r['gameid'];
  $view['score'] = $r['score'];
}

$qr = mysql_query("SELECT COUNT(*) FROM stack WHERE gameid=$gameid AND state='up'");
$black_up = mysql_result($qr,0);
if( $black_up < 1 )
{
  $qr = mysql_query("
    INSERT INTO stack (gameid, blackid)
    SELECT $gameid, b.id
    FROM black b
    LEFT JOIN stack s ON b.id=s.blackid AND gameid=$gameid
    WHERE s.blackid IS NULL
    ORDER BY RAND()
    LIMIT 1
  ");
}
$qr = mysql_query("SELECT s.*,b.* FROM stack s LEFT JOIN black b ON s.blackid=b.id WHERE gameid=$gameid AND state='up'");
$r = mysql_fetch_assoc($qr);
$view['blackid'] = $r['id'];
$view['blacktxt'] = str_replace("_","_____",$r['txt']);
$view['blacknr'] = $r['number'];
$view['blackheight'] = mt_rand(0,20);
$view['blackclass'] = mt_rand(0,1) ? 'love' : 'hate';

$where =  "WHERE gameid=$gameid AND playerid=$playerid AND state IN ('hand','play')";
$qr = mysql_query("SELECT COUNT(*) FROM hand $where");
$hand_count = mysql_result($qr, 0);
if( $hand_count < 10 )
{
  $qr = mysql_query("
    INSERT INTO hand (gameid, playerid, whiteid)
    SELECT $gameid, $playerid, w.id
    FROM white w
    LEFT JOIN hand h ON w.id=h.whiteid AND gameid=$gameid
    WHERE h.whiteid IS NULL
    ORDER BY RAND()
    LIMIT " . (10-$hand_count)
  );
}

$qr = mysql_query("
  SELECT w.*,h.*
  FROM hand h
  LEFT JOIN white w ON h.whiteid=w.id
  $where
");
while( $r = mysql_fetch_assoc($qr) )
{
  $view['hand'][] = array(
    'whiteid'      => $r['id'],
    'txt'          => $r['txt'],
    'thermoheight' => mt_rand(0,20),
    'thermoclass'  => mt_rand(0,1) ? 'love' : 'hate',
  );
}

echo new Mustache(file_get_contents("sah.mhtm"), $view);
