```js
const TableObject = {
  name: String,
  where: [String/[String]],
  columns: [TableObject],
  as: String
}

const query = {
  name: 'bms_booking.booking',
  where: [
    'bookingsKey = "123"',
    'created = "2019"'
  ],
  columns: [
    {name: 'bookingName'},
    {name: 'created'},
    {
      name: 'Biggly.users', 
      where: [
        'bms_booking.booking.createdUserKey = userKey'
      ],
      columns: [
        {name: 'accessLevel'},
        {name: 'concat=>firstName lastName', as: 'fullName'}
      ]
    }
  ]
}
```
These could actually just be inline selects that repeat every time a column item is met.
```sql
SELECT
bookingName,
created,
(SELECT accessLevel FROM Biggly.users WHERE bms_booking.booking.createdUserKey = userKey) as accessLevel, 
-- ^ if no `as` value then use the `name` again.
(SELECT CONCAT(firstName, " ", lastName) FROM Biggly.users WHERE bms_booking.booking.createdUserKey = userKey) as fullName
FROM bms_booking.booking

HAVING bookingsKey = "123" AND created = "2019" 
-- ^ we could use HAVING rather than WHERE as it allows us to be more vague.
```

```js
const query = {
  name: 'bms_booking.booking',
  where: [
    'bookingName != "Bad Name"'
  ]
}

const query = {
  name: 'bms_booking.booking',
  where: [ 'bookingsKey = "123"' ],
  columns: [
    {name: 'bookingName'},
    {name: 'created'},
    {
      name: 'Biggly.uploads', 
      where: [
        'bms_booking.booking.bookingsKey = bookingsKey'
      ],
      columns: [
        {name: 'count=>*', as: 'uploadCount'}
      ]
    }
  ]
}
```
We could leave much of the details up to the user about whether they put the where assignments in the right order
or if the full db.table.column names are correctly selected.

That would give me space to simply create shorthands for many of the more laborious aspects of mysql syntax.

We should start by creating a function that deals with a single **TableObject** level. It should create a full SELECT
query with a WHERE.

Now we have joins working but we'll want to validate all the column selections ect with the schema. The columns should
be fairly easy because a `name` param is always either a single column or a db.table.

db.table is easy to validate so we do that first. once that's done we save the db.table in a global array of objects {db,table}
after that we can match up each column against these db and tables depending on where we are in the query.

The `where` strings will be much more difficult to deal with. We'll have to first split the string into blocks and validate each on.
The blocks will be.

string = '"word"'; // < in this case we validate the string.
number = '1'; // < no validation needed.
column = 'word'; // < in this case we get the db.table from the parent name.
table.column = 'word.word'; // < in this case we get the db from the parent name.
db.table.column = 'word.word.word'; // < in this case we can just validate straight off.
math = '=' || '>' || '<' || '>=' ... etc (look them up in mysql)

Divide the string by spaces.






Once the functions are done I could build custom functions that are mapped by name. They could call from a list of
custom queries we keep in the api somewhere. 

For example I could make a function for the bookings table calls that
requires more of a custom query that JSequal can't manage normally. That would mean that we don't need use another
lambda function for it! All the more custom functions could be stored as query strings in the api then called using
a specified fn name (eg myfunc=>).

We could even replace normal mysql functions like count so that they work within the syntax of JSequal.


Trying to created nested objects in mysql selects does work by using JSON_ARRAYAGG and JSON_OBJECT
can't select more than a single column from the nested select for some reason, who knows.

I think this finally puts the idea of using nested selects to bed. We can do what we want to achieve using a join though.
Try to get an object with all the values of a possible set of records inside a join.


If I get the bookingDivisions table then group by bookingDivKey and join to the bookings and put the bookingName in an array...

It works!

```sql
SELECT
bookingDivisions.bookingDivName,
JSON_ARRAYAGG(JSON_OBJECT("tmpName", divisionTemplates.tmpName)) as divisionTemplates
from bookingDivisions
left join divisionTemplates on bookingDivisions.bookingDivKey = divisionTemplates.bookingDivKey

group by bookingDivisions.bookingDivKey
```
This could possibly solve the count problem as well by doing a group by we could count the matching results
in a row rather than doing a nested select.

Yes it works for the count as well, you just have to add a the joined table.column to the argument and it'll tell
you how many you want to count by.

We might want to add a group by to every query.

What happens if you join more than one table that has multiple results per row? ANSWER: it breaks :( the count from
the second join affects the count of the first one and so the arrayagg function is also effected in the same way...

```sql
SELECT
JSON_ARRAYAGG(JSON_OBJECT("tmpName", divisionTemplates.tmpName)) as divisionTemplates,
count(divisionTemplates.tmpName) as tmpsAmt,
count(bookings.bookingsKey) as bookingAmt,
bookingDivisions.bookingDivName
from bookingDivisions
left join divisionTemplates on bookingDivisions.bookingDivKey = divisionTemplates.bookingDivKey
left join bookings on bookingDivisions.bookingDivKey = bookings.bookingDivKey
group by bookingDivisions.bookingDivKey
```
So you can only do one join like this at a time, meaning if we wanted to do two or more nested json records like this...well
we can't.

Shit. Scrub all that. It does work as a nested select... TODO
```slq
SELECT
(select JSON_ARRAYAGG(JSON_OBJECT("tmpName", divisionTemplates.tmpName, "tmpKey", divisionTemplates.tmpKey)) from divisionTemplates where divisionTemplates.bookingDivKey = bookingDivisions.bookingdivKey) as tmpsAmt,
(select json_arrayagg(json_object("bookingName", bookings.bookingName)) from bookings where bookings.bookingDivKey = bookingDivisions.bookingDivKey) as bookings,
bookingDivisions.bookingDivName
from bookingDivisions
```
Looks like sub selects are back on the table!

Here's how it should work.

```js
name: 'bms_booking.bookings',
columns: [
  {name: 'bookingName'},
  {name: 'bookingsKey'},
  {name: 'createdUserKey'
],
where: [
  'bookingsKey = "123"'
]

queryObj.columns.forEach(col => {
  selects.push(

  )
})

let select = `
  (SELECT ${col.name} FROM ${queryObj.name} WHERE ${queryObj.where}) ${queryObj.as}
  (SELECT ${col.name} FROM ${queryObj.name} WHERE ${queryObj.where}) ${queryObj.as}
  (SELECT ${col.name} FROM ${queryObj.name} WHERE ${queryObj.where}) ${queryObj.as}
`;
```

We only want to do it like the above if it's in one of the join columns.
If we're in the top level (eg the first db.table selection) we want it to act normally.




Finish fixing the function logic then move on to returning nested json records.

We want to find all the possible usefull variables in a name string.

```js
/\w+\=\>|[\(\)]|[`"'](.*?)[`"']|\$*(\w+\.)+\w+|\$*\w+|\\|\/|\+|>=|<=|=>|>|<|-|\*|=/g
```

This regex gets all the things we want and it puts the braces as their own items
which will help us to decide where everything is supposed to go in the function
args.

Functions work great but we can't yet have custom functions until I make the function parser
a bit smarter.

I'll have to leave custom functions as a future feature for now.


Add the update, create and delete logic.

Do validation on update, create and delete.

For a nested record all you have to do is add an `as` param to the parent object.


```js
const query = {
  name: 'bms_booking.bookings',
  columns: [
  {name: 'bookingName'},
  {name: 'bookingsKey'},
    {
      name: 'bms_booking.uploads',
      columns: [
        {name: 'fileName'},
        {name: 'uploadKey', as: 'tmpUploadKey'}
      ],
      where: [
       'bookings.bookingsKey = uploads.bookingsKey'
      ],
      as: 'uploads' // < here
    }
  ]
}

//  SELECT
//  bookingName,
//  bookingsKey,
//  (select JSON_ARRAYAGG(JSON_OBJECT("fileName", uploads.fileName, "tmpUploadKey", uploads.uploadKey)) from uploads where bookings.bookingsKey = uploads.bookingsKey) as uploads
//  from bms_booking.bookings


//  result[0] = {
//   bookingName: 'Cool Booking',
//   bookingsKey: '123',
//   uploads: [
//     { filName: 'Great file', tmpUploadKey: '1234' },
//     { filName: 'Greater file', tmpUploadKey: '12345' },
//   ]
// }
```

Make the custom functions feature.

If we have the string
(bookingDivName concat=>(" a thing" myFun=>() myFunc=>(concat=>())) " yet another thing")

We get the array..
args = (, bookingDivName, concat=>, (, " a thing", myFunc=>, (, ), myFunc=>, (, concat=>, (, ), ), ), " yet another thing", )
       0  1               2         3  4           5         6  7  8         9  10        11 12 13 14 15                    16

And convert any function names.
args = (, bookingDivName, CONCAT,  (, " a thing",  myFunc,   (, ),  myFunc,   (, CONCAT,   (, ), ), ), " yet another thing", )
       0  1               2         3 4            5         6  7   8         9  10        11 12 13 14 15                    16

Then we get the argument positions
positions = [ 7, 7 ], [ 12, 12 ], [ 10, 13 ], [ 4, 14 ], [ 1, 16 ] 

The pattern is any positions values that are the same as each other means there's no arguments and those functions 
(unless they're custom) can be flattened.

If they are custom they can be called, returning their string in place of the name.

If the function doesnt have an argument flatten it
args = (, bookingDivName, CONCAT,  (, " a thing",  "myFunc args where: []",  myFunc,   (, CONCAT(), ), ), " yet another thing", )

Get the new argument positions
args = (, bookingDivName, CONCAT,  (, " a thing",  "myFunc args where: []",  myFunc,   (, CONCAT(), ), ), " yet another thing", )
       0  1               2        3  4            5                         6         7  8         9  10 11                    12

There's a pattern here. The position items that have the smallest difference between their numbers are the inner most
arguments. 

A position difference of 3 is the least you can have to have a function with a function with arguments as an argument. None of these arguments will have nested
function arguments but they might be custom so you'll still need to call them before flattening the argument.

positions = [8, 9] [4, 10] [1, 12] 

Again if the position difference is less than 3 we can call it or flatten it.

9 - 8 = 1 call or flatten (in this case call it).

Get the new argument positions again
args = (, bookingDivName, CONCAT,  (, " a thing",  "myFunc args where: []",  "myFunc args where: [CONCAT()]", ), " yet another thing", )
       0  1               2        3  4            5                         6                                7  8                     9

positions = [4, 7] [1, 9]

Now there are no positions left with a difference less than 3. We just grab the one with the least difference (probably always the earliest one).

If it's a custom function call it, passing in the arguments, if not then we can just flatten it.

args = (, bookingDivName, CONCAT(" a thing",  "myFunc args where: []",  "myFunc args where: [CONCAT()]"), " yet another thing", )
       0  1               2                                                                               3                     4

positions = [1, 4]

Now there's only one position left we can flatten it and return the args.

args = ['bookingDivName', 'CONCAT(" a thing",  "myFunc args where: []",  "myFunc args where: [CONCAT()]")', '" yet another thing"']


That's done! I think. There's a couple of things to remember about custom functions.

1. They only accept strings (and maybe numbers...?).
2. They must return a string.
3. If a mysql function is passed as a function it will be in sring form
and *with* it's parenthesees, eg 'CONCAT()'.



Fix the functions logic. I've assumed that all of the arguments are functions
by using the condition `if(i === start - 2)`. This grabs the function name and
adds arguments to it. But what if the arguments aren't functions and the 
args being passed are just one big argument. Another thing is if `start` is
1 then start - 2 is -1! Which also breaks everything.

So to fix it, rather than converting all the function names into CAPS at the beginning
we'll leave them so we can check they're function names with a regex (/\w+\=\>/) 
within the loop, then we can just convert them as we go.


Nested functions no longer work. For example...
{name: 'replace=>(replace=>(bookingName "%20" " ") "K" "SS")', as: 'bookingName'},

The functions should be working, they'll need some more testing. 

Allow functions to be used on the top level `name` param for full control of a custom query.
The setNameString function is a bit mixed up. See index.js:218

Because this feature works at the very top level it would potentially have a high impact on the
rest of the design and so there's some things I think I should clean up before adding it.

The way the structure works at the moment is:

**selectSQ** = Entrypoint, runs validation, then parses queryObject then returns results. The validation runs first over everything.
**parseSelect** = Builds each part of the query as seperate strings SELECT, FROM, WHERE, LIMIT, AS. Then returns the queryString.

Each string in **parseSelect** is built with a basic map except the *columns* array which has some special functions to handle it:

We do a *columns*.map which decides what to do with each column item. Here is where I think things should be done a bit differently.
Although ultimately this might end up impacting the whole structure seeing as the parent object should really be treated just like
an item in *columns*.

What I think should be happening is, **parseNestedJson** and **parseNestedSelect** are inside **parseSelect** when they should be
further down the chain inside **setNameString**.

The problem with moving them is that the `as` logic gets a bit moxed up. This is because **setNameString** accepts `col.name` and so
doesn't deal with `col.as`. **parseNestedJson** and **parseNestedSelect** both accept the whole `col` object. I could simply have
**setNameString** accept the whole `col` object as well but issues arise because I've hinched in the `as` param to return a nested
which actualy mis-aligns with how mysql uses AS but is such a great feature from a user perspective it should definitely stay. 

Work out exactly where `as` should be handled and how.


parseSelect({
  name: 'bms.booking.bookings',
  columns: [],
  where: []
})

If this object has an `as` *and* the name is 'something.somthing' it will run a 
parseNestedJson on it, every `as` inside that function will be put into the columns
as for each param to decide on the name of the param inside the json object returned.

If it hasn't got an `as` but the name is 'something.something' it will call
parseNestedSelect, which is the same as parseSelect but slighetly different...

What's difference between parseNestedSelect and parseSelect?

1. parseNestedSelect objects *must* have a `columns` array. Although parseSelect
   actually sends back a empty string in the SELECT if there's no cols which
   breaks the query and essentially does the same thing.
2. parseNestedSelect doesn't parse nested json objects.
3. parseNestedSelect gives the `col.name` as the AS if there's no `col.as` param.
   whereas parseSelect just leaves it out.
4. Major difference: parseNestedSelect uses WHERE and parseSelect uses HAVING.
5. parseNestedSelect looks for a LIMIT on `col.limit` as well as `queryObj.limit`, 
   which looks like a mistake.

They're pretty much the same except for the fact that parseNestedSelect actually runs a 
big map.().join() over the whole column, meaning it nests a big select inside each `name` 
item but we could just do this by routing back to parseSelect from setNameString. So we
should be able to get rid of parseNestedSelect completely.

setNameString should be like a router that decides what to do with each name string. It 
should be full of `if` statements.

I've realised the need for nestedSelect. It deals with the fact that you can't have more 
than one column name in a nested select, we use the `as` param in a totally different 
place for nested selects. 

parseNestedSelect: '(SELECT param FROM ...) AS thing'
parseSelect:       '(SELECT param AS thing, param AS thing FROM ...)'

That's fine, we'll just keep parseNestedSelect but put it into setNameString instead of
having it directly inside parseSelect.

Finally now we can put anything in the top level `name` and then we know we just go to
**setNameString** to write the condition and function to handle it.



























Make json query strings compatible with data keys
This works but it doesn't work if you try to set
a value to a json object. It just sets it as a string.



The error handling is much better in the jsonql, this is because
all the errors are generated as the query is built which at first seems more
confusing but it actually makes more sense. Now you have a good idea
of the structure of jseq add the error handling back in rather than
doing it all first.

I've done a first pass of the error handling, no testing.

The `as` is causing issues again. We can't do nested names more than one level
deep because jseq uses the whatever's in the `name` for the AS and the 
AS doesn't accept db.table.

Nested Selects

The nested selects don't work quite like they should.

If I where to do

```js
columns: [
  {
    name: 'bms_campaigns.bookingTemplates', 
    columns: [
      {name: 'bookingTmpKey'},
      {name: 'bookingDivKey'}
      {
        name: 'bms_booking.bookingDivisions', 
        columns: [
          {name: 'bookingDivName'}
        ], where: [
          'bookingDivisions.bookingDivKey = bookingTemplates.bookingDivKey'
        ]
      }
    ], where: [
      'bookingTemplates.bookingTmpKey = products.bookingTmpKey'
    ]
  },
],
```

I would expect this result
```sql
(
  SELECT 
    (
      SELECT bms_booking.bookingDivisions.bookingDivName 
      FROM bms_booking.bookingDivisions 
      WHERE bookingDivisions.bookingDivKey = bookingTemplates.bookingDivKey
    ) AS bookingDivName  
  FROM bms_campaigns.bookingTemplates 
  WHERE bookingTemplates.bookingTmpKey = products.bookingTmpKey 
) AS bookingDivName

```
What I actually get is

```sql
(
  SELECT 
    (
      SELECT bms_booking.bookingDivisions.bookingDivName 
      FROM bms_booking.bookingDivisions 
      WHERE bookingDivisions.bookingDivKey = bookingTemplates.bookingDivKey
    ) AS bookingDivName 
  FROM bms_campaigns.bookingTemplates 
  WHERE bookingTemplates.bookingTmpKey = products.bookingTmpKey
) AS bms_booking.bookingDivisions -- < The AS is wrong.
```

It's using the `name` of the nested select for the outer `as`
of the parent select. It needs to use it's own `name` param.
 
No matter how far down the nest goes, we always want the outermost AS
to be the name of the column we're selecting in the innermost select.







==== MARK 

There's a bug with posting, if any field is undefined it breaks createSQ





If no columns are passed to a selectSQ it should fetch all columns from that
table that are not hidden.

There's a small bug where if you put a function in a nested select
the `as` will automatically be set to the original function string syntax...
` AS count=>(meals)`
...which breaks the query. You can just put an `as` in to fix it but
it should render as...
` AS COUNT(meals)`
I think the problem lies in the fact that **setNameString** should
probably be handling the `as` as well whereas at the moment it's outside it.
But because we have the funny `as` behaviour with the nested selects it's
a little bit complicated.




Allow a string to be passed to the query as well as a query object...
`createSQ('mcDonalds.meals', data);`
`selectSQ('filterOptions=>()');`
`updateSQ('mcDonalds.meals.mealKey = "123"', data);`

Auto key and hidden to the schema.
Have update and create return the record they created/updated.

Input and output custom functions (myFunc=> myFunc->)

Could custom functions not return a string and instead *do* something?
Allow custom functions to be nested inside one another.

Make json query strings compatible with `where` strings.













