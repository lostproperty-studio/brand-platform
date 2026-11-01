-- The platform used to add a built-in "Layout maker" tool to every project. Tools are now only ones the studio adds,
-- so remove the automatic ones.
delete from tools where kind = 'layouts';
