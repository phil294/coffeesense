# export default anonymous class (non-proprietary example)
export default class
  constructor: (@name) ->
  greet: (who) -> console.log "Hello #{who} from #{@name}"
