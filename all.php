<style>
body {
  background: #eee;
  font-family: monospace;
}
div {
  display: inline-block;
  padding: 3px 10px;
  margin: 2px;
  border: 1px solid black;
}
.white {
  background: white;
  color: black;
}
.black {
  background: black;
  color: white;
}
</style>
<?

  ini_set('display_errors',true);
  error_reporting(E_ALL&~E_NOTICE);
  include "../inc/config.inc";

  mysql_select_db(trim(file_get_contents('dbname')));

  $qr = mysql_query("SELECT color,txt FROM card ORDER BY CHAR_LENGTH(txt)");

  while( list($c, $t) = mysql_fetch_row($qr) )
  {
    if( $c == 'white' )
    {
      $t = ucfirst($t);
    }

    $t = htmlentities($t, ENT_QUOTES, 'UTF-8');
    echo "<div class=$c>$t</div>";
  }
