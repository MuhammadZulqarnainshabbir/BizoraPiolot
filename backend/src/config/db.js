import mongoose from 'mongoose';

/**
 * Connects to MongoDB. Sales use multi-document transactions, which need a replica set
 * (a single-node one is fine for development; Atlas always is). Refuses to start without one.
 */
export async function connectDB(uri = process.env.MONGO_URI) {
  await mongoose.connect(uri);
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName) {
    await mongoose.disconnect();
    throw new Error('MongoDB must run as a replica set because sales use transactions. ' +
      'For local development, add "replication: replSetName: rs0" to mongod.cfg, restart MongoDB and run rs.initiate() (see README).');
  }
  // Make sure unique indexes (e.g. one serial number per shop) exist before serving requests.
  await Promise.all(Object.values(mongoose.models).map(model => model.init()));
  console.log(`MongoDB connected (replica set ${hello.setName})`);
}
