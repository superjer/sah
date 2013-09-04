<?

ini_set('display_errors',true);
error_reporting(E_ALL&~E_NOTICE);
include "../inc/config.inc";

if( !isset($_SESSION['userid']) )
  die("You need to log in!");

$username = $_SESSION['selfname'];
$userid = intval( $_SESSION['userid'] );
$playerid = 0;

$input = file_get_contents("php://input");
$in = @json_decode($input);
$in === false and die(json_encode(array('msg'=>$input)));
$in = (array)$in;

$json = array();
$json['username'] = $username;
$json['score']    = 0;
$json['hand']     = array();
$json['consider'] = array();
$json['black']    = array();
$json['players']  = array();

mysql_select_db('sah');

// what game are we in?
$qr = mysql_query("SELECT * FROM player WHERE user=$userid");
if( mysql_num_rows($qr) < 1 )
{
  $gameid = 1;
}
else
{
  $r = mysql_fetch_assoc($qr);
  $playerid = $r['id'];
  $gameid = $r['gameid'];
  $json['score'] = $r['score'];
}

$lockname = "sah-game-$gameid";
$qr = mysql_query("SELECT GET_LOCK('$lockname',10)");
if( mysql_result($qr,0) != 1 )
  die(json_encode(array('msg'=>"Cannot get lock for game $gameid")));

if( !$playerid )
{
  mysql_query("INSERT INTO player SET gameid=$gameid, user=$userid");
  $playerid = mysql_insert_id() or
    die(json_encode(array('msg'=>"Cannot join game twice")));
}

// get game
$qr = mysql_query("
  SELECT
    g.*,
    TIMEDIFF(NOW(),g.ts) deltat,
    u.name winnername
  FROM game g
  LEFT JOIN player p ON g.winner=p.id
  LEFT JOIN superjer.users u ON p.user=u.id
  WHERE g.id=$gameid
");
echo mysql_error();
$gamerow = mysql_fetch_assoc($qr);
$json['game'] = $gamerow;
$secs = explode( ':', $gamerow['deltat'] );
$secs = $secs[0]*60*60 + $secs[1]*60 + $secs[2];
$json['game']['secs'] = $secs;
$czar = $gamerow['czar'];

// choose czar?
if( !$czar )
{
  $qr = mysql_query("SELECT id FROM player WHERE gameid=$gameid AND !idle ORDER BY czarts LIMIT 1");
  if( mysql_num_rows($qr) > 0 )
  {
    $czar = $gamerow['czar'] = $json['game']['czar'] = mysql_result($qr,0);
    mysql_query("UPDATE game SET czar=$czar WHERE id=$gameid");
    mysql_query("UPDATE player SET czarts=CURRENT_TIMESTAMP() WHERE id=$czar");
  }
}

// incoming actions?
$callingit = false;
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

  case 'choose':
    if( $czar != $playerid )
    {
      $json['msg'] = "You're not the Card Czar!";
      break;
    }
    if( $gamerow['state'] != 'select' )
      break;
    $winner = intval($in['playerid']);
    mysql_query("UPDATE game SET state='bask',winner=$winner WHERE id=$gameid");
    mysql_query("UPDATE player SET score=score+1 WHERE id=$winner");
    break;

  case 'draw':
    break;

  case 'abandon':
    if( $gamerow['state'] == 'select' )
      mysql_query("UPDATE player SET abandon=1 WHERE id=$playerid");
    break;

  case 'callit':
    if( $czar != $playerid )
    {
      $json['msg'] = "You're not the Card Czar!";
      break;
    }
    // fall thru ...

  default:
    if( $gamerow['state'] != 'gather' )
      break;
    if( $secs < 60 && $in['action'] != 'callit' )
      break;
    $callingit = true;
    $qr = mysql_query("
      SELECT *
      FROM hand
      WHERE gameid=$gameid AND state='play' AND playerid!=$czar
      ORDER BY playerid,position
    ");
    while( $r = mysql_fetch_assoc($qr) )
      $putforward[ $r['playerid'] ][] = $r;
    foreach( $putforward as $_ => $pfwd )
      for( $i=1; $i<=count($pfwd); $i++ )
        $withatleast[$i]++;
    break;
}

// get scorelist
$playercount = 0;
$abandoners = 0;
$idleabandoners = 0;
$idlers = 0;
$qr = mysql_query("
  SELECT p.*,COUNT(h.state) whatup,u.name 
  FROM player p
  LEFT JOIN superjer.users u ON p.user=u.id
  LEFT JOIN hand h ON h.gameid=$gameid AND h.playerid=p.id AND h.state='play'
  WHERE p.gameid=$gameid
  GROUP BY p.user
  ORDER BY p.idle,p.id
");
while( $r = mysql_fetch_assoc($qr) )
{
  $json['players'][] = array(
    'name'   => $r['name'],
    'score'  => ($r['score']  ? $r['score']  : ''),
    'whatup' => ($r['whatup'] ? $r['whatup'] : ''),
    'idle'   => ($r['idle']   ? $r['idle']   : ''),
    'czar'   => ($gamerow['czar']==$r['id'] ? 1 : 0),
    'myself' => ($playerid==$r['id'] ? 1 : 0),
  );
  $playercount++;
  if( $r['abandon'] )
  {
    if( $r['idle'] ) $idleabandoners++; else $abandoners++;
  }
  if( $r['idle']    ) $idlers++;
}
$actives = $playercount - $idlers - 1;
$json['playersmd5'] = md5(serialize($json['players']));
$json['abandonratio'] = $abandoners ? "$abandoners/$actives" : '';

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
while( $callingit )
{
  if( $withatleast[$playnr] < 2 )
  {
    $in['action'] == 'callit' and
      $json['msg'] = "Need at least 2 players' submissions";
    break;
  }

  if( $secs < 20 && $withatleast[$playnr] < $actives )
  {
    $in['action'] == 'callit' and
      $json['msg'] = "Wait until 20 seconds have passed or all non-idle players are in";
    break;
  }

  $whites = array();
  $stillkickin = array($czar);
  foreach( $putforward as $pfplr => $pfwd )
  {
    if( count($pfwd) < $playnr ) break;
    $stillkickin[] = $pfplr;
    for( $i=0; $i<$playnr; $i++ )
      $whites[] = $pfwd[$i]['whiteid'];
  }
  if( count($stillkickin) > 1 )
  {
    $stillkickin = implode(',',$stillkickin);
    mysql_query("
      UPDATE player
      SET idle=idle+1
      WHERE gameid=$gameid AND id NOT IN ($stillkickin)"
    );
    mysql_query("
      UPDATE player
      SET idle=0
      WHERE gameid=$gameid AND id IN ($stillkickin)
    ");
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
  break;
}

// draw white cards?
$qr = mysql_query("
  SELECT COUNT(*)
  FROM hand
  WHERE gameid=$gameid AND playerid=$playerid AND state IN ('hand','play','consider')
  ");
$json['handcount'] = mysql_result($qr, 0);
if( $json['handcount'] < 10 && $in['action'] == 'draw' )
{
  $qr = mysql_query("
    INSERT INTO hand (gameid, playerid, whiteid)
    SELECT $gameid, $playerid, w.id
    FROM white w
    LEFT JOIN hand h ON w.id=h.whiteid AND gameid=$gameid
    WHERE h.whiteid IS NULL
    ORDER BY RAND()
    LIMIT 1"
  );
}

// find white cards
$json['slots'] = array(array(),array(),array());
$consider = array();
$qr = mysql_query("
  SELECT w.*,h.*
  FROM hand h
  LEFT JOIN white w ON h.whiteid=w.id
  WHERE gameid=$gameid AND (playerid=$playerid OR state='consider') AND state IN ('hand','play','consider')
  ORDER BY h.position,w.txt
");
while( $r = mysql_fetch_assoc($qr) )
{
  $txt = ucfirst( $r['txt'] );
  if( $txt[0]=='"' )
    $txt[1] = strtoupper( $txt[1] );

  $inplay = ($r['state'] == 'play');

  $card = array(
    'whiteid'      => $r['id'],
    'txt'          => $txt,
    'thermoheight' => mt_rand(0,20),
    'thermoclass'  => mt_rand(0,1) ? 'love' : 'hate',
    'inplay'       => $inplay,
  );

  if( $r['state'] == 'consider' )
    $consider[$r['playerid']][] = $card;
  else
    $json['hand'][] = $card;

  if( $inplay )
    $json['slots'][ $r['position'] ] = array(
      'whiteid'      => $r['id'],
      'txt'          => $txt,
    );
}

// preset submitted cards
if( $consider )
{
  $json['consider'] = array();
  foreach( $consider as $cplr => $c )
    $json['consider'][] = array('playerid'=>$cplr, 'cards'=>$c);

  function comp($a,$b){
    return strcmp($a['cards'][0]['txt'], $b['cards'][0]['txt']);
  }
  usort( $json['consider'], comp );
}

// end basking?
if( $gamerow['state'] == 'bask' && $secs>5 )
{
  mysql_query("UPDATE game SET state='gather',winner=0,czar=0 WHERE id=$gameid");
  mysql_query("UPDATE hand SET state='discard' WHERE gameid=$gameid AND state='consider'");
  mysql_query("UPDATE stack SET state='discard' WHERE gameid=$gameid AND state='up'");
  mysql_query("UPDATE player SET abandon=0 WHERE gameid=$gameid");
}

// abandon the Czar?
if( $gamerow['state'] == 'select' )
{
  if(    ($abandoners == $actives)
      || ($abandoners > 0 && $secs > 120)
      || ($idleabandoners > 0 && $secs > 240)
  ){
    mysql_query("UPDATE game SET state='bask' WHERE id=$gameid");
    mysql_query("UPDATE hand SET state='hand' WHERE gameid=$gameid AND state='consider'");
    mysql_query("UPDATE player SET idle=idle+1 WHERE gameid=$gameid AND id=$czar");
  }
}

$qr = mysql_query("SELECT RELEASE_LOCK('$lockname')");

echo json_encode($json);
