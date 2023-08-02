CREATE TABLE employees
(
    id SERIAL,
    name text,
    title text,
    CONSTRAINT employees_pkey PRIMARY KEY (id)
);

INSERT INTO employees(name, title) VALUES
 ('Meadow', 'Head of Operations'),
 ('Harry',  'Developer'),
 ('Jon',    'Marketing Manager');

