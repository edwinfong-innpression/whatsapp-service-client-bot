// 點名
export async function attendance(intent, slots, user) {
  const { classId, student } = slots
  // call 你 backend API
  const actionText =
    intent.subAction === 'present' ? '簽到' :
    intent.subAction === 'absent' ? '缺席' : '病假'

  return `已記錄：${student} / ${classId} / ${actionText}`
}
