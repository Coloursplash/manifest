//! The library: schema, on-disk store, and folder watching.

pub mod schema;
pub mod store;
pub mod watch;

pub use schema::{Entry, Medium, Status};
