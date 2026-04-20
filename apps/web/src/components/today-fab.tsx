import { motion, AnimatePresence } from 'framer-motion';
import { Sun, X } from 'lucide-react';

type Props = {
  active: boolean;
  onToggle: () => void;
};

export function TodayFAB({ active, onToggle }: Props) {
  return (
    <motion.button
      type="button"
      className={`today-fab${active ? ' today-fab--active' : ''}`}
      onClick={onToggle}
      title={active ? 'Fechar Modo Hoje' : 'Modo Hoje'}
      whileHover={{ scale: 1.08, boxShadow: '0 8px 28px rgba(0,0,0,0.35)' }}
      whileTap={{ scale: 0.93 }}
      animate={{ opacity: active ? 1 : 0.4 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {active ? (
          <motion.span
            key="close"
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 90, opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ display: 'flex' }}
          >
            <X size={18} />
          </motion.span>
        ) : (
          <motion.span
            key="sun"
            initial={{ rotate: 90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: -90, opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ display: 'flex' }}
          >
            <Sun size={18} />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
