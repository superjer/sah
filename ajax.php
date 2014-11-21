<?

$starttime = microtime(true);

ini_set('display_errors',true);
error_reporting(E_ALL&~E_NOTICE);
include "../inc/config.inc";

isset($_SESSION['userid']) or
  die(json_encode(array('msg'=>"Please <a href=../!login.php?return=sah>log in</a> to the forum to play.")));

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
$json['lobby']    = array();

mysql_select_db(trim(file_get_contents('dbname')));

// do we already have a player record?
$qr = q("SELECT * FROM player WHERE user=$userid");
if( mysql_num_rows($qr) < 1 )
{
  q("INSERT INTO player SET gameid=0, user=$userid");
  $playerid = mysql_insert_id() or die(json_encode(array('msg'=>'Error creating player record')));
  $gameid = 0;
  $json['score'] = 0;
}
else
{
  $r = mysql_fetch_assoc($qr);
  $playerid = $r['playerid'];
  $gameid = $r['gameid'];
  $json['score'] = $r['score'];
}

// need to process create action early!
if( $in['action'] == 'create' )
{
  $gamename  = mysql_real_escape_string($in['name']);
  $slowstart = $in['slowstart'] ? 1 : 0;

  $sets = '';
  $gamegoal    = intval($in['goal'       ]) and $sets .= ", goal=$gamegoal";
  $maxrounds   = intval($in['maxrounds'  ]) and $sets .= ", maxrounds=$maxrounds";
  $roundsecs   = intval($in['roundsecs'  ]) and $sets .= ", roundsecs=$roundsecs";
  $abandonsecs = intval($in['abandonsecs']) and $sets .= ", abandonsecs=$abandonsecs";
  $pass        = mysql_real_escape_string($in['pass']) and $sets .= ", pass='$pass'";

  q("
    INSERT INTO game
    SET name='$gamename', slowstart=$slowstart $sets
  ");
  $in['action'] = 'join';
  $gameid = $in['gameid'] = mysql_insert_id();
}

// need to process join action early!
if( $in['action'] == 'join' )
{
  $joingame = intval($in['gameid']);

  $qr = q("SELECT pass FROM game WHERE gameid=$joingame");
  list($gamepass) = mysql_fetch_row($qr);

  if( $gamepass && $gamepass != $in['pass'] )
  {
    $json['msg'] = "Sorry, wrong password.";
  }
  else
  {
    $qr = q("SELECT MAX(czarts) FROM player WHERE gameid=$gameid");
    list($maxczarts) = mysql_fetch_row($qr);
    q("
      UPDATE player
      SET
        gameid=$joingame,
        score=0,
        idle=0,
        abandon=0,
        czarts='$maxczarts' - INTERVAL 1 SECOND
      WHERE user=$userid
    ") and $gameid = $joingame;
  }
}

if( !$gameid )
{
  $json['inlobby'] = 1;
  $qr = q("
    SELECT g.*, TIMEDIFF(NOW(), g.ts) deltat, COALESCE(MAX(p.score), '') high, COUNT(p.playerid) players
    FROM game g
    LEFT JOIN player p ON g.gameid = p.gameid
    GROUP BY g.gameid
  ");
  while( $r = mysql_fetch_assoc($qr) )
  {
    $r['secs'] = diff2secs( $r['deltat'] );
    $r['pass'] = strlen($r['pass']) ? 1 : 0;
    $json['lobby'][] = $r;
  }
  echo json_encode($json);
  return;
}

$lockname = "sah-game-$gameid";
$qr = q("SELECT GET_LOCK('$lockname',10)");
if( mysql_result($qr,0) != 1 )
  die(json_encode(array('msg'=>"Cannot get lock for game $gameid")));

// delete empty or very old games
switch( mt_rand(0,100) )
{
  case 0:
    q("DELETE FROM game WHERE NOT EXISTS(SELECT * FROM player WHERE gameid=game.gameid)");
    break;
  case 1:
    q("DELETE FROM game WHERE ts < NOW() - INTERVAL 2 WEEK");
    break;
}

// get game
$qr = q("
  SELECT
    g.*,
    TIMEDIFF(NOW(),g.ts) deltat,
    u.name winnername,
    c.playerid czarpresent
  FROM game g
  LEFT JOIN player c ON g.czar=c.playerid AND c.gameid=$gameid
  LEFT JOIN player p ON g.winner=p.playerid
  LEFT JOIN superjer.users u ON p.user=u.id
  WHERE g.gameid=$gameid
");

// exit non-existant game immediately!!
if( mysql_num_rows($qr) < 1 )
  q("UPDATE player SET gameid=0 WHERE playerid=$playerid");

$gamerow = mysql_fetch_assoc($qr);
$json['game'] = $gamerow;
$secs = diff2secs( $gamerow['deltat'] );
$json['game']['secs'] = $secs;
$czar = $gamerow['czar'];

// keep player ts up to date
$idlebit = "";
$in['movement'] and $idlebit = "idle=0,";
q("UPDATE player SET $idlebit ts=NOW() WHERE playerid=$playerid");

// choose czar?
if( !$czar || !$gamerow['czarpresent'] )
{
  $qr = q("
    SELECT playerid
    FROM player
    WHERE gameid=$gameid AND !idle
    ORDER BY
      IF(idle or ts < NOW() - INTERVAL 20 SECOND, 0, 1),
      czarts
    LIMIT 1
  ");
  if( mysql_num_rows($qr) > 0 )
  {
    $czar = $gamerow['czar'] = $json['game']['czar'] = mysql_result($qr,0);
    q("UPDATE game SET czar=$czar WHERE gameid=$gameid");
    q("UPDATE player SET czarts=CURRENT_TIMESTAMP() WHERE playerid=$czar");
  }
}

// incoming actions?
$callingit = false;
$putforward = array();
$withatleast = array(1=>0, 2=>0, 3=>0);
switch( $in['action'] )
{
  case 'move':
    if( $gamerow['state'] != 'gather' )
      break;
    $state   = $in['inplay'] ? 'play' : 'hand';
    $slot    = intval($in['slot']);
    $whiteid = intval($in['whiteid']);
    q("
      UPDATE hand
      SET state='$state',position='$slot'
      WHERE gameid=$gameid AND playerid=$playerid AND cardid=$whiteid
    ");
    break;

  case 'reveal':
    if( $czar != $playerid )
    {
      $json['msg'] = "You're not the Card Czar!";
      break;
    }
    if( $gamerow['state'] != 'select' )
      break;
    $revealmy = intval($in['playerid']);
    q("UPDATE hand SET state='consider' WHERE gameid=$gameid AND playerid=$revealmy AND state='hidden'");
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
    if( !$winner )
      break;
    q("UPDATE game SET state='bask',winner=$winner WHERE gameid=$gameid");
    q("UPDATE player SET score=score+1 WHERE playerid=$winner");
    break;

  case 'draw':
    break;

  case 'abandon':
    if( $gamerow['state'] == 'select' )
      q("UPDATE player SET abandon=1 WHERE playerid=$playerid");
    break;

  case 'vote':
    $cardid = intval($in['cardid']);
    $yeanay = $in['yeanay'] == 'yea' ? 1 : -1;
    q("
      REPLACE INTO vote
      SET user=$userid, cardid=$cardid, vote=$yeanay
    ");
    break;

  case 'leave':
    q("
      UPDATE player
      SET gameid=0
      WHERE playerid=$playerid
    ");
    break;

  case 'callit':
    if( $czar != $playerid )
    {
      $json['msg'] = "You're not the Card Czar!";
      break;
    }

    $manualcall = true;
    // fall thru ...

  default:
    if( $gamerow['state'] != 'gather' )
      break;

    $outtatime  = $secs >= $gamerow['roundsecs'];
    $autocall   = !$gamerow['slowstart'] || $gamerow['round'] > 1;

    if( !($outtatime && $autocall) && !$manualcall )
      break;

    $callingit = true;
    $qr = q("
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
$hiscore = 0.5;
$prows = array();
$qr = q("
  SELECT
    p.*,
    TIMEDIFF(NOW(), p.ts) deltat,
    COUNT(h.state) whatup,
    u.name
  FROM player p
  LEFT JOIN superjer.users u ON p.user=u.id
  LEFT JOIN hand h ON h.gameid=$gameid AND h.playerid=p.playerid AND h.state='play'
  WHERE p.gameid=$gameid
  GROUP BY p.user
  ORDER BY p.idle,p.playerid
");

while( $r = mysql_fetch_assoc($qr) )
{
  $prows[] = $r;

  if( $r['score'] == $hiscore )
    $hiscore += 0.5;
  else if( $r['score'] > $hiscore )
    $hiscore = $r['score'];
}

foreach( $prows as $r )
{
  $gonefor = diff2secs( $r['deltat'] );
  $json['players'][] = array(
    'name'   => $r['name'],
    'score'  => ($r['score']  ? $r['score']  : ''),
    'whatup' => ($r['whatup'] ? $r['whatup'] : ''),
    'idle'   => ($r['idle']   ? $r['idle']   : ''),
    'gone'   => ($gonefor > 10                    ? 1 : 0),
    'czar'   => ($gamerow['czar']==$r['playerid'] ? 1 : 0),
    'myself' => ($playerid==$r['playerid']        ? 1 : 0),
  );

  $playercount++;

  if( $r['abandon'] )
  {
    if( $r['idle'] ) $idleabandoners++; else $abandoners++;
  }

  if( $r['idle'] ) $idlers++;

  // a little wonky using >=, but the round is incremented after the champ-state-check
  $outtarounds = $gamerow['round'] >= $gamerow['maxrounds'];
  $highestscore = $r['score'] == $hiscore;
  $goalscore = $r['score'] >= $gamerow['goal'];

  if( $goalscore || ($highestscore && $outtarounds) )
  {
    static $winmsgs = array(
      '%s cheated!',
      'Cheats detected on %s\'s computer!',
      '%s had the best cheats',
      '%s only had to cheat a little to win',
      '%s cheated the most',
      '%s is today\'s best cheater',
      'Nice cheats, %s',
      'No one cheated as well as %s',
      'Someone check %s for cheats',
      '%s was cheating and then won. Coincidence?',
    );
    $winmsg = $winmsgs[ $gameid % count($winmsgs) ];
    $json['champ'] = sprintf( $winmsg, $r['name'] );
  }
}

$actives = $playercount - $idlers - 1;
$json['playersmd5'] = md5(serialize($json['players']));
$json['abandonratio'] = $abandoners ? "$abandoners/$actives" : '';

// draw a new black card?
$qr = q("SELECT COUNT(*) FROM stack WHERE gameid=$gameid AND state='up'");
$black_up = mysql_result($qr,0);
if( $black_up < 1 )
{
  $qr = q("
    SELECT COUNT(*)
    FROM card b
    LEFT JOIN stack s ON b.cardid=s.cardid AND gameid=$gameid
    WHERE s.cardid IS NULL AND b.color='black'
  ");
  $r = mysql_fetch_row($qr);
  $rand = mt_rand(0, $r[0]-1);
  $qr = q("
    INSERT INTO stack (gameid, cardid)
    SELECT $gameid, b.cardid
    FROM card b
    LEFT JOIN stack s ON b.cardid=s.cardid AND gameid=$gameid
    WHERE s.cardid IS NULL AND b.color='black'
    ORDER BY b.cardid
    LIMIT $rand,1
  ");
}

$qr = q("
  SELECT s.*, b.*, SUM(v.vote) votesum, COUNT(v.vote) ttlvotes
  FROM stack s
  LEFT JOIN card b ON s.cardid=b.cardid
  LEFT JOIN vote v ON s.cardid=v.cardid
  WHERE gameid=$gameid AND state='up'
  GROUP BY s.cardid
");
$r = mysql_fetch_assoc($qr);
$thermoheight = get_height( $r['votesum'], $r['ttlvotes'] );
$blacktxt = $r['txt'];
$json['black']['cardid'] = $r['cardid'];
$json['black']['txt']    = str_replace("_","<span>_______</span>",$blacktxt);
$json['black']['nr']     = $playnr = $r['number'];
$json['black']['height'] = $thermoheight;
$json['black']['class']  = $r['votesum'] > 0 ? 'love' : 'hate';

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
      $whites[] = $pfwd[$i]['cardid'];
  }
  if( count($stillkickin) > 1 )
  {
    $stillkickin = implode(',',$stillkickin);
    q("
      UPDATE player
      SET idle=idle+1
      WHERE gameid=$gameid AND playerid NOT IN ($stillkickin)"
    );
    q("
      UPDATE player
      SET idle=0
      WHERE gameid=$gameid AND playerid IN ($stillkickin)
    ");
  }
  if( count($whites) )
  {
    q("
      UPDATE hand
      SET state='hidden'
      WHERE gameid=$gameid AND cardid IN (".implode(',',$whites).")"
    );
    q("UPDATE game SET state='select' WHERE gameid=$gameid");
  }
  break;
}

// draw white cards?
$qr = q("
  SELECT COUNT(*)
  FROM hand
  WHERE gameid=$gameid AND playerid=$playerid AND state IN ('hand','play','hidden','consider')
  ");
$json['handcount'] = mysql_result($qr, 0);
if( $json['handcount'] < 10 && $in['action'] == 'draw' )
{
  $qr = q("
    SELECT COUNT(*)
    FROM card w
    LEFT JOIN hand h ON w.cardid=h.cardid AND gameid=$gameid
    WHERE h.cardid IS NULL AND w.color='white'
  ");
  $r = mysql_fetch_row($qr);
  $rand = mt_rand(0, $r[0]-1);
  $qr = q("
    INSERT INTO hand (gameid, playerid, cardid)
    SELECT $gameid, $playerid, w.cardid
    FROM card w
    LEFT JOIN hand h ON w.cardid=h.cardid AND gameid=$gameid
    WHERE h.cardid IS NULL AND w.color='white'
    ORDER BY w.cardid
    LIMIT $rand,1
  ");
}

// find white cards
$json['slots'] = array(array(),array(),array());
$consider = array();
$qr = q("
  SELECT w.*, h.*, SUM(v.vote) votesum, COUNT(v.vote) ttlvotes
  FROM hand h
  LEFT JOIN card w ON h.cardid=w.cardid
  LEFT JOIN vote v ON h.cardid=v.cardid
  WHERE gameid=$gameid AND (playerid=$playerid OR state IN ('hidden','consider')) AND state IN ('hand','play','hidden','consider')
  GROUP BY h.cardid
  ORDER BY h.position,w.txt
");
while( $r = mysql_fetch_assoc($qr) )
{
  $txt = ucfirst( $r['txt'] );
  if( $txt[0]=='"' )
    $txt[1] = strtoupper( $txt[1] );

  $inplay = ($r['state'] == 'play');

  $thermoheight = get_height( $r['votesum'], $r['ttlvotes'] );

  $card = array(
    'whiteid'      => $r['cardid'],
    'txt'          => $txt,
    'rawtxt'       => $r['txt'],
    'thermoheight' => $thermoheight,
    'thermoclass'  => $r['votesum'] > 0 ? 'love' : 'hate',
    'inplay'       => $inplay,
    'state'        => $r['state'],
  );

  if( in_array($r['state'], array('hidden','consider')) )
    $consider[$r['playerid']][] = $card;
  else
    $json['hand'][] = $card;

  if( $inplay )
    $json['slots'][ $r['position'] ] = array(
      'whiteid'      => $r['cardid'],
      'txt'          => $txt,
    );
}

// preset submitted cards
if( $consider )
{
  $json['consider'] = array();
  $hasemail = (strpos($blacktxt, '_@_') !== false);
  $blankstart = ($blacktxt[0] == '_');
  foreach( $consider as $cplr => $cards ){
    $repltxt = $blacktxt;
    $i = 0;
    foreach( $cards as $c ){
      $rawtxt = $c['rawtxt'];
      if( $hasemail )
        $rawtxt = str_replace(' ','-',$rawtxt);
      if( $blankstart && $i==0 )
        $rawtxt = ucfirst($rawtxt);
      $cnt = (++$i == count($cards) ? -1 : 1);
      $repltxt = preg_replace('/_/', "<span>$rawtxt</span>", $repltxt, $cnt);
    }
    $repltxt = ucfirst($repltxt);
    $json['consider'][] = array('playerid'=>$cplr, 'repltxt'=>$repltxt, 'cards'=>$cards);
  }

  function comp($a,$b){
    return strcmp($a['cards'][0]['txt'], $b['cards'][0]['txt']);
  }
  usort( $json['consider'], comp );
}

// end basking?
if( $gamerow['state'] == 'bask' && $secs>5 )
{
  if( $json['champ'] )
  {
    $newstate = 'champ';
    $roundinc = "";
  }
  else
  {
    $newstate = 'gather';
    $roundinc = ",round=round+1";
  }

  q("UPDATE game SET state='$newstate',winner=0,czar=0$roundinc WHERE gameid=$gameid");
  q("UPDATE hand SET state='discard' WHERE gameid=$gameid AND state IN ('hidden','consider')");
  q("UPDATE stack SET state='discard' WHERE gameid=$gameid AND state='up'");
  q("UPDATE player SET abandon=0 WHERE gameid=$gameid");
}

// abandon the Czar?
if( $gamerow['state'] == 'select' )
{
  if(    ($abandoners == $actives)
      || ($abandoners > 0 && $secs > $gamerow['abandonsecs'] )
      || ($idleabandoners > 0 && $secs > $gamerow['abandonsecs'] * 2 )
  ){
    q("UPDATE game SET state='bask' WHERE gameid=$gameid");
    q("UPDATE hand SET state='hand' WHERE gameid=$gameid AND state IN ('hidden','consider')");
    q("UPDATE player SET idle=idle+1 WHERE gameid=$gameid AND playerid=$czar");
  }
}

$qr = q("SELECT RELEASE_LOCK('$lockname')");

echo json_encode($json);


function diff2secs($timediff)
{
  $secs = explode( ':', $timediff );
  return $secs[0]*60*60 + $secs[1]*60 + $secs[2];
}

function get_height($votesum, $ttlvotes)
{
  $denom = min(20, $ttlvotes + 2);
  return min(20, 20 - intval(abs($votesum)*20 / $denom));
}

function q($q)
{
  static $tqt = 0;

  if( $q === 'TOTAL QUERY TIME' )
    return $tqt;

  $start = microtime(true);
  $qr = mysql_query($q);
  $err = mysql_error();
  $time = microtime(true) - $start;
  $tqt += $time;

  if( $err )
    L("err -- $q\n", '/tmp/query-error.log');

  if( $tqt > 1 )
    L(
      str_pad(number_format($time, 3), 6, ' ', STR_PAD_LEFT) . "\t" .
      substr(preg_replace("/\s+/", " ", $q), 0, 60),
      '/tmp/query-time.log'
    );

  return $qr;
}

function L($msg, $file="/tmp/sah.log")
{
  $msg = date('Y-m-d H:i:s') . "\t(" . getmypid() . "\t$msg\n";
  error_log($msg, 3, $file);
}

$tst = microtime(true) - $starttime;
if( $tst > 1 )
{
  $tqt = q("TOTAL QUERY TIME");
  L("Query: $tqt\tScript: $tst", "/tmp/query-time.log");
}

// vim: sw=2 ts=2 et
