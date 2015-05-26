<?php

  header( "Access-Control-Allow-Origin: *" );

?>
<!DOCTYPE html>
<html>
<head>
<title>SuperJer Against Humanity</title>
<meta name=viewport content="initial-scale=1 width=720, user-scalable=yes">
<link rel=stylesheet type="text/css" href="sah.css">
<script src="//ajax.googleapis.com/ajax/libs/jquery/1.10.2/jquery.min.js"></script>
<script src="//ajax.googleapis.com/ajax/libs/jqueryui/1.10.3/jquery-ui.min.js"></script>
<script src="//www.superjer.com:1337/socket.io/socket.io.js"></script>
<script src="jquery.ui.touch-punch.min.js"></script>
<script src="node/client.js"></script>
</head>
<body>

<div class=err><span></span><button>X</button></div>

<div class=scoresheet>
  <h2>⌛ <span class=clock>0</span></h2>
  <h1><span>SuperJer </span><span>Against </span><span>Humanity</span></h1>
  <table>
    <thead>
    <tr>
      <th>Player</th>
      <th></th>
      <th>Pts</th>
      <th>Card</th>
    </tr>
    <thead>
    <tbody>
    </tbody>
  </table>
  <p>Room: <span></span></p>
  <a class=help href='javascript:;'>How to Play</a>
  <button disabled class='mobonly callit'>Call it</button>
  <button disabled class='mobonly draw'>Draw</button>
  <button class=leave>Exit</button>
  <button class=scale>Scale</button>
</div>

<div class=leftcol>

<div class=holder>
  <div class="card blackcard" blackid=0>
    <div class=cardtxt></div>
    <div class=num>Play <div>0</div></div>
  </div>
</div>

<div class=play>
  <div class=holder slot=0><div class="card slot"></div></div>
  <div class=holder slot=1><div class="card slot"></div></div>
  <div class=holder slot=2><div class="card slot"></div></div>
</div>

<div class="holder buttons nomob">
  <div class=card>
    <button disabled class=callit>Call it</button>
    <button disabled class=draw>Draw</button>
  </div>
</div>

<div class=hand>
  <div class=holder slot=0><div class="card slot"></div></div>
  <div class=holder slot=1><div class="card slot"></div></div>
  <div class=holder slot=2><div class="card slot"></div></div>
  <div class=holder slot=3><div class="card slot"></div></div>
  <div class=holder slot=4><div class="card slot"></div></div>
  <div class=holder slot=5><div class="card slot"></div></div>
  <div class=holder slot=6><div class="card slot"></div></div>
  <div class=holder slot=7><div class="card slot"></div></div>
  <div class=holder slot=8><div class="card slot"></div></div>
  <div class=holder slot=9><div class="card slot"></div></div>
</div>

</div> <!-- leftcol -->

<div class=shade></div>

<div class="win champwin">
  <div>
    GAME OVER
    <h1>Someone cheated!</h1>
    <div class=scoresheet>
      <table>
        <thead>
        <tr>
          <th>Final scores</th>
          <th></th>
          <th>Pts</th>
          <th>Card</th>
        </tr>
        <thead>
        <tbody>
        </tbody>
      </table>
      <button class=leave>Exit</button>
    </div>
    <div class=clear></div>
  </div>
</div>

<div class="win selectwin">
  <div>
    <button class=abandon>Abandon</button>
    <button class=confirm>Confirm</button>
    <h1 class=wintitle>Choose winner...</h1>
    <div class=clear></div>
    <div class="card blackcard" blackid=0 style='width:200px;height:300px;'>
      <div class=cardtxt style='height:280px;'></div>
      <div class=num>Play <div>0</div></div>
    </div>
    <div class=contenders></div>
    <div class=clear></div>
  </div>
</div>

<div class="win lobbywin">
  <div>
    <a class=help href='javascript:;'>How to Play</a>
    <h1 class=lobtitle>Cards Against SuperJer Lobby</h1>
    <ul>
      <li class="jointab selected">Join a room</li>
      <li class="createtab">Create a new room</li>
    </ul>
    <div class=joinpage>
      <div class=clear></div>
      <div class=filters>
        <label>
          Filter: <input class=filter type=text>
        </label>
        <label>
          <input class=activeonly type=checkbox> Active only
        </label>
      </div>
      <table>
        <thead>
          <tr>
            <th>Room name</th>
            <th>Round</th>
            <th>Players</th>
            <th>High</th>
            <th>Status</th>
            <th></th>
            <th></th>
          </tr>
        </thead>
        <tbody>
        </tbody>
      </table>
      <div class=norooms>There are currently no rooms. Try creating a new one!</div>
    </div>
    <div class=createpage>
      <label title='Type in a name for your room.'>
        <div>Room name</div>
        <input id=name name=roomname value=''>
      </label>
      <label title='Set a password to keep your room private.'>
        <div>Room password</div>
        <input id=pass name=roompass value=''>
      </label>
      <label title='The game will end when a player reaches this score.'>
        <div>Goal score</div>
        <input id=goal name=goal value=11 size=6>
      </label>
      <label title='The game will end after this many rounds.'>
        <div>Max rounds</div>
        <input id=maxrounds name=maxrounds value=55 size=6>
      </label>
      <label title='The round will be called after this many seconds if 2+ players have submitted card(s). The Czar can also call it before this time.'>
        <div>Round time (seconds)</div>
        <input id=roundsecs name=roundsecs value=180 size=6>
      </label>
      <label title='The round will be abandoned after this many seconds if 1+ active players have voted to abandon. It will also be abandoned after twice this many seconds if 1+ idle players have voted to abandon. If all active players vote to abandon the round is abandoned immediately.'>
        <div>Abandon time (seconds)</div>
        <input id=abandonsecs name=abandonsecs value=180 size=6>
      </label>
      <label title='If checked, the first round will never be called automatically. This allows you to wait for players to arrive.'>
        <div>
          <input type=checkbox id=slowstart name=slowstart checked> Slow start
        </div>
      </label>
      <br><br>
      <button class=create>Create</button>
    </div>
    <div class=clear></div>
  </div>
</div>

</body>
</html>
