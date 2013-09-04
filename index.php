<?

ini_set('display_errors',true);
include "mustache.php";

error_reporting(E_ALL&~E_NOTICE);
include "../inc/config.inc";

$view = array();
$view['hand'] = range(0,9);
$view['slots'] = range(0,2);
$view['reset'] = ($_SESSION['userid'] == 2);

echo new Mustache(file_get_contents("sah.mhtm"), $view);
