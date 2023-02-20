{
  const postal = window.PostalWorker();
  postal.on('notifications', msg => console.info(msg));
}
