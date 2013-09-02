<?

ini_set('display_errors',true);
error_reporting(E_ALL&~E_NOTICE);
include "../inc/config.inc";

if( !isset($_SESSION['userid']) )
  die("You need to log in!");

$username = $_SESSION['selfname'];
$userid = intval( $_SESSION['userid'] );

$input = file_get_contents("php://input");
$in = @json_decode($input);
$in === false and die(json_encode(array('bad'=>$input)));
$in = (array)$in;

$json = array();
$json['username'] = $username;
$json['score']    = 0;
$json['hand']     = array();
$json['black']    = array();
$json['players']  = array();

mysql_select_db('sah');

// what game are we in?
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
  $json['score'] = $r['score'];
}

// get game
$qr = mysql_query("SELECT *,TIMEDIFF(NOW(),ts) deltat FROM game WHERE id=$gameid");
echo mysql_error();
$gamerow = mysql_fetch_assoc($qr);
$json['game'] = $gamerow;
$secs = explode( ':', $gamerow['deltat'] );
$secs = $secs[0]*60*60 + $secs[1]*60 + $secs[2];
$json['game']['secs'] = $secs;

// incoming actions?
$putforward = array();
$withatleast = array(1=>0, 2=>0, 3=>0);
switch( $in['action'] )
{
  case 'reset':
    mysql_query("DELETE FROM hand WHERE gameid=$gameid");
    mysql_query("DELETE FROM stack WHERE gameid=$gameid");
    mysql_query("UPDATE game SET state='gather',ts=CURRENT_TIMESTAMP() WHERE id=$gameid");
    $json['game']['deltat'] = "00:00:00";
    $json['game']['secs'] = 0;
    break;

  case 'callit':
    if( $secs < 30 || $gamerow['state']!='gather' )
      break;
    $qr = mysql_query("SELECT * FROM hand WHERE gameid=$gameid AND state='play' ORDER BY playerid,position");
    while( $r = mysql_fetch_assoc($qr) )
      $putforward[ $r['playerid'] ][] = $r;
    foreach( $putforward as $_ => $pfwd )
      for( $i=1; $i<=count($pfwd); $i++ )
        $withatleast[$i]++;
    break;

  case 'move':
    $state   = $in['inplay'] ? 'play' : 'hand';
    $slot    = intval($in['slot']);
    $whiteid = intval($in['whiteid']);
    mysql_query("
      UPDATE hand
      SET state='$state',position='$slot'
      WHERE gameid=$gameid AND playerid=$playerid AND whiteid=$whiteid
    ");
    break;
}

// get scorelist
$qr = mysql_query("
  SELECT p.*,COUNT(h.state) whatup,u.name 
  FROM player p
  LEFT JOIN superjer.users u ON p.user=u.id
  LEFT JOIN hand h ON h.gameid=$gameid AND h.playerid=p.id AND h.state='play'
  WHERE p.gameid=$gameid
  GROUP BY p.user
");
while( $r = mysql_fetch_assoc($qr) )
{
  $json['players'][] = array(
    'name'   => $r['name'],
    'score'  => $r['score'],
    'whatup' => $r['whatup'],
  );
}

// draw a new black card?
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
$qr = mysql_query("
  SELECT s.*, b.*
  FROM stack s
  LEFT JOIN black b ON s.blackid=b.id
  WHERE gameid=$gameid AND state='up'
");
$r = mysql_fetch_assoc($qr);
$json['black']['id']     = $r['id'];
$json['black']['txt']    = str_replace("_","_____",$r['txt']);
$json['black']['nr']     = $playnr = $r['number'];
$json['black']['height'] = mt_rand(0,20);
$json['black']['class']  = mt_rand(0,1) ? 'love' : 'hate';

// calling it?
if( $in['action']=='callit' && $withatleast[$playnr] >= 2 )
{
  $whites = array();
  foreach( $putforward as $pfplr => $pfwd )
  {
    if( count($pfwd) < $playnr ) break;
    for( $i=0; $i<$playnr; $i++ )
      $whites[] = $pfwd[$i]['whiteid'];
  }
  if( count($whites) )
  {
    mysql_query("
      UPDATE hand
      SET state='consider'
      WHERE gameid=$gameid AND whiteid IN (".implode(',',$whites).")"
    );
    mysql_query("UPDATE game SET state='select' WHERE id=$gameid");
  }
}

// draw white cards?
$where = "WHERE gameid=$gameid AND playerid=$playerid AND state IN ('hand','play','consider')";
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

// find white cards
$json['slots'] = array(array(),array(),array());
$qr = mysql_query("
  SELECT w.*,h.*
  FROM hand h
  LEFT JOIN white w ON h.whiteid=w.id
  $where
");
while( $r = mysql_fetch_assoc($qr) )
{
  if( $r['state'] == 'consider' )
    continue;

  $txt = ucfirst( $r['txt'] );
  if( $txt[0]=='"' )
    $txt[1] = strtoupper( $txt[1] );

  $inplay = ($r['state'] == 'play');

  $json['hand'][] = array(
    'whiteid'      => $r['id'],
    'txt'          => $txt,
    'thermoheight' => mt_rand(0,20),
    'thermoclass'  => mt_rand(0,1) ? 'love' : 'hate',
    'inplay'       => $inplay,
  );

  if( $inplay )
    $json['slots'][ $r['position'] ] = array(
      'whiteid'      => $r['id'],
      'txt'          => $txt,
    );
}

// see if calling the round
$playercount = count($json['players']);
$enoughcount = 0;
foreach( $json['players'] as $jp )
  $enoughcount += $jp['whatup'];

$qr = mysql_query("
  SELECT COUNT(*)
  FROM hand
  WHERE gameid=$gameid AND state='play'
  GROUP BY playerid
");

echo json_encode($json);
