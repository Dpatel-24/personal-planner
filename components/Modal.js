// Modal — centered overlay surface. Backdrop click closes; inner click doesn't.
import { overlayBackdrop, modal as modalStyle } from '@/lib/components';

export default function Modal({ children, onClose, width = 420 }) {
  return (
    <div style={overlayBackdrop} onClick={onClose}>
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width,
          maxWidth: '92vw',
          maxHeight: '90vh',
          overflowY: 'auto',
          ...modalStyle,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
