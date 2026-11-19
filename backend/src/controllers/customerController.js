import * as customers from '../services/customerService.js';
import { handle } from '../utils/http.js';

export const list = handle(async (req, res) => res.json(await customers.listCustomers(req.actor, req.shop._id, req.query)));
export const create = handle(async (req, res) => res.status(201).json(await customers.createCustomer(req.actor, req.shop._id, req.body)));
export const get = handle(async (req, res) => res.json(await customers.getCustomer(req.actor, req.shop, req.params.id)));
export const update = handle(async (req, res) => res.json(await customers.updateCustomer(req.actor, req.shop._id, req.params.id, req.body)));
export const remove = handle(async (req, res) => { await customers.deleteCustomer(req.actor, req.shop._id, req.params.id, req.body); res.status(204).end(); });
export const addDocument = handle(async (req, res) => res.status(201).json(await customers.addDocument(req.actor, req.shop._id, req.params.id, req.body)));
export const getDocument = handle(async (req, res) => res.json(await customers.getDocument(req.actor, req.shop._id, req.params.id, req.params.docId)));
export const deleteDocument = handle(async (req, res) => { await customers.deleteDocument(req.actor, req.shop._id, req.params.id, req.params.docId); res.status(204).end(); });
