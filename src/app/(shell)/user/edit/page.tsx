'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { getUserProfile, updateUserProfile, UserProfile, Gender } from '@/services/api';
import { notifyProfileUpdate } from '@/store/profileEvents';
import styles from './page.module.css';

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 0, label: '保密' },
  { value: 1, label: '男' },
  { value: 2, label: '女' },
  { value: 3, label: '其他' },
];

export default function EditProfilePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState('');
  const [gender, setGender] = useState<Gender>(0);
  const [birthday, setBirthday] = useState('');
  const [region, setRegion] = useState('');

  useEffect(() => {
    async function loadProfile() {
      try {
        const data = await getUserProfile();
        const user = data.user;
        setNickname(user.nickname || '');
        setAvatar(user.avatar || '');
        setGender(user.gender ?? 0);
        setBirthday(user.birthday || '');
        setRegion(user.region || '');
      } catch (err) {
        const message = err instanceof Error ? err.message : '加载失败';
        setError(message.includes('未登录') ? '请先登录' : message);
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSaving(true);

    try {
      const updateData: Record<string, unknown> = {};
      
      if (nickname) updateData.nickname = nickname;
      if (avatar && avatar.startsWith('data:')) updateData.avatar = avatar;
      if (gender !== undefined) updateData.gender = gender;
      if (birthday) updateData.birthday = birthday;
      if (region) updateData.region = region;

      if (Object.keys(updateData).length === 0) {
        setError('没有要更新的内容');
        setSaving(false);
        return;
      }

      await updateUserProfile(updateData as any);
      notifyProfileUpdate();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : '保存失败';
      setError(message.includes('未登录') ? '请先登录' : message);
    } finally {
      setSaving(false);
    }
  }

  function handleAvatarClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result;
      if (typeof result === 'string') {
        setAvatar(result);
      }
    };
    reader.readAsDataURL(file);
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>加载中...</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.title}>编辑资料</h1>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.avatarSection}>
            <div className={styles.avatarPreview} onClick={handleAvatarClick}>
              {avatar ? (
                <img src={avatar} alt="头像" className={styles.avatarImg} />
              ) : (
                <div className={styles.avatarPlaceholder}>点击上传头像</div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className={styles.fileInput}
              onChange={handleFileChange}
            />
            <input type="hidden" name="avatar" value={avatar} />
          </div>

          <div className={styles.fieldGroup}>
            <Input
              label="昵称"
              value={nickname}
              onChange={(e) => setNickname(e.currentTarget.value)}
              placeholder="请输入昵称"
            />

            <div className={styles.field}>
              <label className={styles.label}>性别</label>
              <div className={styles.genderOptions}>
                {GENDER_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`${styles.genderBtn} ${gender === opt.value ? styles.genderBtnActive : ''}`}
                    onClick={() => setGender(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <Input
              label="生日"
              type="date"
              value={birthday}
              onChange={(e) => setBirthday(e.currentTarget.value)}
            />

            <Input
              label="地区"
              value={region}
              onChange={(e) => setRegion(e.currentTarget.value)}
              placeholder="请输入地区"
            />
          </div>

          {error && <div className={styles.error}>{error}</div>}
          {success && <div className={styles.success}>保存成功</div>}

          <div className={styles.actions}>
            <Button type="submit" disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
            <button type="button" className={styles.cancelBtn} onClick={() => router.back()}>
              取消
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
