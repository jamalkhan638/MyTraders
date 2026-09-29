import base from '@mytraders/config/eslint';
import globals from 'globals';

export default [...base, { languageOptions: { globals: { ...globals.node, ...globals.jest } } }];
