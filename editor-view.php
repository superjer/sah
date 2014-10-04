<? extract($view); ?>
<script src="//ajax.googleapis.com/ajax/libs/jquery/1.10.2/jquery.min.js"></script>
<script src="//ajax.googleapis.com/ajax/libs/jqueryui/1.10.3/jquery-ui.min.js"></script>
<style>
table {border:1px solid black;}
</style>
<table>
<? foreach( $rows as $r ): extract($r); ?>
  <tr style='background-color:<?=$color?>;color:<?=$textcolor?>;'>
    <td><?=$number?>
    <td><?=$txt?>
  </tr>
<? endforeach; ?>
</table>
