import t from 'tcomb'
import validate from 'uuid-validate'
export const uuid = t.refinement(t.String, s => validate(s), 'UUID')
