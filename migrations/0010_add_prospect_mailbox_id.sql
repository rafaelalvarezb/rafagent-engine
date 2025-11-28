ALTER TABLE prospects ADD COLUMN mailbox_id varchar REFERENCES mailboxes(id) ON DELETE SET NULL;

