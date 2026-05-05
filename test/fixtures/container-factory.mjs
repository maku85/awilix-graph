// ESM container — async factory function as default export
import { createContainer, asValue } from 'awilix';
export default async function build() {
  const container = createContainer();
  container.register({ mode: asValue('esm-factory') });
  return container;
}
