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

echo "<style>.slot {color:red;}</style>";

echo "<div id=black>";
echo str_replace( '_', '<span class=slot>_</span>', $blacktxt );
echo "</div><hr>";

$qr = mysql_query("SELECT * FROM white ORDER BY RAND() LIMIT 10");
while( $r = mysql_fetch_assoc($qr) )
{
  $whitetxt = $r['txt'];
  $whiteid = $r['id'];
  echo "<div><label><input type=checkbox clicknr=0>$whitetxt</input></label></div>";
}

?>
<script src="//ajax.googleapis.com/ajax/libs/jquery/1.9.1/jquery.min.js"></script>
<script>
var n = 0;
$('input').change(function(){
  $(this).attr('clicknr',++n);
  $chk = $('input:checked');

  var vals = [];
  var i;

  for( i = 0; i < $chk.length; i++ )
    vals[ $chk.eq(i).attr('clicknr') ] = $chk.eq(i).parent().text();

  var $slots = $('.slot');
  var s = 0;

  $slots.text('_');

  for( i in vals )
    $slots.eq(s++).text(vals[i]);

  while( s < $slots.length )
    $slots.eq(s++).text(vals[i]);
});
</script>
