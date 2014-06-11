
truncate card;
load data local infile 'cards.tab' into table card
  (author, color, number, txt);

