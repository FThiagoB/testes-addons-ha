const { Router } = require('express');
const userController = require('../controllers/userController');

const router = Router();

router.get('/', userController.list);
router.post('/', userController.create);
router.put('/:id', userController.update);
router.delete('/:id', userController.remove);

router.get('/:id/image', userController.getImage);
router.post('/:id/image', userController.setImage);
router.delete('/:id/image', userController.deleteImage);

module.exports = router;