// Settings fixed at build time.
//
// GOOGLE_CLIENT_ID: the OAuth client that every copy of the extension signs in with, so people
// installing it from a store never have to create one. A client ID is public by design: it is in
// every sign-in address. The client *secret* must never go here or anywhere in this repo.
// Leave it empty to make each person paste their own (the setup panel then appears).
export const GOOGLE_CLIENT_ID = '';
