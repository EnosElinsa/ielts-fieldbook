import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFieldbook } from '../../context/FieldbookContext';
import { navigateWithPracticeGuard } from '../../lib/practiceNavigation';

export function SettingsModal() {
  const fb = useFieldbook();
  const navigate = useNavigate();
  useEffect(() => {
    if (fb.modal !== 'settings') return;
    fb.closeModal();
    navigateWithPracticeGuard('/settings/target', () => navigate('/settings/target'));
  }, [fb.modal, fb.closeModal, navigate]);
  return null;
}
