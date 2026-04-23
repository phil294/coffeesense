# Basic document symbol fixture
class Person
  constructor: (@name) ->
  greet: (who) ->
    console.log "Hello #{who} from #{@name}"

square = (n) -> n * n
